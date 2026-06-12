'use server'

import { cookies, headers } from 'next/headers'
import { env } from '@/env'
import { getPathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { routing } from '@/i18n/routing'
import { getDefaultVisionProvider } from '@/lib/ai/vision/registry'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import {
  anonymousSessionCookieAttrs,
  readAnonymousSessionCookie,
} from '@/lib/legal/anonymous-session-cookie'
import { anonymousRateLimit } from '@/lib/rate-limit/anonymous-rate-limit'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { extractIp, hashIp } from '@/lib/rate-limit/ip-hash'
import { UpstashKVClient } from '@/lib/rate-limit/upstash-kv-client'
import { isKanjiVariant } from '@/lib/sakenowa/kanji-variants'
import {
  findSakeByBrandOnly,
  findSakeByBreweryOnly,
  findSakeByExtraction,
  lookupBreweryByBrand,
} from '@/lib/sakenowa/lookup'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import { resolveConfidenceTier } from './confidence-tier'
import type { ScanActionState } from './scan-action-state'

/**
 * Phase 3 / S1 + S2 + S3 scan Server Action.
 *
 * What S1 (#106) shipped:
 *   - Accepts the FormData from the client `<ScanForm />`.
 *   - Returned a HARDCODED extraction (Dassai / Asahi Shuzo) to prove out
 *     the wire shape and the end-to-end happy path.
 *   - Parses the result through `LabelScanExtractionSchema` so the source
 *     pinning is the same parse-time seam the real provider hits.
 *   - Runs the real `findSakeByExtraction` against the Sakenowa mirror.
 *   - Returns a tagged-union result for `useActionState` to render.
 *
 * What S2 (#107) added:
 *   - Issues / refreshes the `yawaragi_session` cookie (signed opaque
 *     ~16-byte id, 24h sliding TTL). The cookie's `sid` is one of two
 *     rate-limit budget keys.
 *   - Runs `anonymousRateLimit` against the `vision-scan` bucket
 *     (5 calls per identifier per 24h, sliding window). On exhaustion
 *     the action returns a tagged `rate_limited` state and the form UI
 *     renders the localized "try again in X" copy.
 *   - Neither identifier reaches Postgres or any log line.
 *
 * What S3 (#108, this slice) replaces:
 *   - The hardcoded extraction is gone. The action now calls
 *     `getDefaultVisionProvider().extractLabel(blob)` against the real
 *     downscaled JPEG. The default registry key is
 *     `anthropic-haiku-4-5`; the Playwright spec overrides with
 *     `VISION_PROVIDER=e2e-stub` so CI does not burn Anthropic credit.
 *   - The rate-limit gate still runs BEFORE the vision call — there is
 *     no path that reaches the paid model without first paying the
 *     bucket. CLAUDE.md JMStV / cost-protection invariant.
 *   - Extractions in the `confirm` or `auto` tier run the Sakenowa
 *     lookup → matched / matched_brand_only / ambiguous / no_match
 *     branches. Extractions in the `retry` tier short-circuit to the
 *     `low_confidence` state and never touch Sakenowa. The UI splits
 *     auto vs confirm presentation by re-calling
 *     `resolveConfidenceTier` on the extraction's confidence — the
 *     action returns the same `matched` shape for both.
 *
 * Out of scope for this slice (deferred to S4 PR B / #109):
 *   - Disambiguation list UI (renders the candidates as tappable rows
 *     with brewery + prefecture)
 *   - No-match enrichment (renders extracted name + provenance badge)
 *   - "Not this one?" affordance on the matched sake page
 *   - Playwright specs covering every branch in EN + DE
 *   - Age-gate "requires_age_gate" gate-resume flow
 */

/**
 * Confidence at or above which the action treats the extraction as
 * high-confidence and runs the Sakenowa lookup → matched/ambiguous/
 * no_match branches. Below the retry threshold, the action returns
 * the `low_confidence` state and the UI surfaces a retry CTA. The
 * `confirm` tier (0.60–0.85) still runs the lookup; the UI's confirm
 * card is what differentiates it from `auto` (≥ 0.85). See
 * `confidence-tier.ts` for the pure resolver.
 */

function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value)
}

/**
 * Hiragana (U+3040–309F) + Katakana (U+30A0–30FF) + CJK Unified
 * Ideographs (U+4E00–9FFF). The three blocks cover every script the
 * label-scan extraction should produce for `name_ja` / `brewery_ja`.
 * Latin-only output is the failure mode this catches — see the
 * `containsNoJapaneseScript` call site for the operational context.
 */
const JAPANESE_SCRIPT_REGEX = /[぀-ゟ゠-ヿ一-鿿]/

function containsNoJapaneseScript(value: string): boolean {
  return !JAPANESE_SCRIPT_REGEX.test(value)
}

/**
 * Best-available English label for a Sakenowa entity. Prefers the
 * LLM-derived `nameRomaji` (cleaner, populated by the romaji-ingest
 * pipeline from #121) over Sakenowa's published `name` (the
 * canonical fallback). Returns `null` only if neither is present —
 * the schemas declare `name` as required so this is effectively
 * non-null in practice, but the optional chaining keeps it safe
 * against a future Brewery whose `name` legitimately empties out
 * (CONTEXT.md "Naming convention" allows brewery.name to be an
 * empty string in some Sakenowa fixtures).
 */
function bestRomaji(entity: Pick<Brand | Brewery, 'name' | 'nameRomaji'>): string | null {
  if (entity.nameRomaji) return entity.nameRomaji
  if (entity.name) return entity.name
  return null
}

/**
 * Maps a lookup-side ambiguous candidate (full Brand + Brewery
 * objects) onto the wire-shape carried by the action state's
 * `ambiguous` variant — locale-aware `sakeHref`, romaji distilled
 * via `bestRomaji`, brewery info denormalised onto each row.
 */
function ambiguousCandidateFromLookup(
  c: { sake: Brand; brewery: Brewery },
  locale: Locale,
): {
  brandId: number
  sakeHref: string
  nameKanji: string
  nameRomaji: string | null
  breweryKanji: string
  breweryRomaji: string | null
} {
  return {
    brandId: c.sake.brandId,
    sakeHref: getPathname({
      locale,
      href: { pathname: '/sake/[brandId]', params: { brandId: String(c.sake.brandId) } },
    }),
    nameKanji: c.sake.nameKanji,
    nameRomaji: bestRomaji(c.sake),
    breweryKanji: c.brewery.nameKanji,
    breweryRomaji: bestRomaji(c.brewery),
  }
}

/**
 * Returns the brand kanji to display prominently on the
 * matched_brand_only divergence card. Prefers the visitor's
 * extracted form (`extracted`) when it's a kanji-variant of the
 * canonical catalogue form (`canonical`) — so a visitor who
 * scanned `蔵王` sees `蔵王` even when Sakenowa stores `藏王`. The
 * lookup already matched the canonical row through variant
 * expansion; only the displayed string follows the visitor's eye.
 *
 * For the field-swap rescue path the `extracted` value is the
 * model's single-char hallucination — `isKanjiVariant` returns
 * false there and we correctly fall back to the canonical form.
 */
function preferExtractedWhenVariant(extracted: string, canonical: string): string {
  return isKanjiVariant(extracted, canonical) ? extracted : canonical
}

/**
 * Real-world sake brand names in Sakenowa are essentially never a
 * single character — the shortest brand kanji we've observed is two
 * characters (e.g. `磯自慢`, `黒龍`, `酔鯨`). A one-character `name_ja`
 * is a strong signal that the model produced "high-confidence
 * coherent garbage" — it returned a single kanji that *looks*
 * plausible (`梗` "stem", `斗` "dipper") at a confidence that
 * normally implies a clean read, but it's a hallucinated fragment,
 * not a real brand. Caught in 2026-06-11 mobile testing on a
 * `jin_junmai_manzairaku.jpg` photo: model returned `name_ja: '梗'`
 * at confidence 0.72 (tier 'confirm') — Sakenowa lookup correctly
 * returned no_match, but the visitor never gets to see *why* the
 * scan failed unless we surface the heuristic in the debug overlay.
 *
 * Routing to `low_confidence` is the right outcome: the visitor sees
 * a "couldn't read clearly" CTA and re-scans, instead of a confusing
 * "not in our catalogue" message that suggests the bottle isn't in
 * Sakenowa when really the model just hallucinated.
 */
function looksLikeSingleCharHallucination(name_ja: string): boolean {
  // `Array.from` counts code points, not UTF-16 units, so a surrogate-
  // pair kanji (rare in sake names, but possible) reads as 1 not 2.
  return Array.from(name_ja).length === 1
}

/**
 * Server Action invoked by `<ScanForm />`. `_prev` is the previous
 * `useActionState` value (ignored — every submission is fresh). The
 * `formData` carries the downscaled JPEG under `image` and the visitor's
 * locale under `locale` so the redirect URL is locale-correct without
 * the action having to re-derive it from headers.
 */
export async function scanAction(
  _prev: ScanActionState,
  formData: FormData,
): Promise<ScanActionState> {
  // Read the debug cookie up-front. When set, every downstream module
  // (rate-limit, vision, Sakenowa) appends per-step events via
  // `getCurrentDebugLog()` / `debugAdd(...)` — no parameter threading
  // through stable seams. The accumulated events are attached to the
  // response under `debugLog` so the client `<DebugPanel />` can render
  // them next to its own client-side events.
  const cookieJar = await cookies()
  const log = isDebugEnabledFromCookies(cookieJar) ? new DebugLog() : undefined

  const result = await runWithDebugLog(log, async (): Promise<ScanActionState> => {
    const image = formData.get('image')
    if (!(image instanceof Blob) || image.size === 0) {
      debugAdd('ScanAction', 'invalid_input: missing or empty image blob', undefined, 'warn')
      return { status: 'invalid_input', reason: 'missing_image' }
    }
    debugAdd('ScanAction', `received image (${image.size} bytes, ${image.type || 'no MIME'})`)

    const localeRaw = formData.get('locale')
    if (typeof localeRaw !== 'string' || !isLocale(localeRaw)) {
      debugAdd('ScanAction', `invalid_input: unsupported locale "${String(localeRaw)}"`, undefined, 'warn')
      return { status: 'invalid_input', reason: 'unsupported_locale' }
    }

    // Rate-limit gate. Issues / refreshes `yawaragi_session` and consults
    // the vision-scan bucket. On exhaustion the action returns the tagged
    // `rate_limited` state and never reaches the vision provider.
    const rateLimit = await enforceRateLimit()
    if (!rateLimit.allowed) {
      return { status: 'rate_limited', retryAfterSec: rateLimit.retryAfterSec }
    }

    // Real vision call (S3) + Sakenowa lookup, wrapped in a single
    // try/catch so an Anthropic outage, a schema-validation retry
    // exhaustion (random non-sake images regularly bottom out here —
    // the model returns empty strings, the schema rejects, the AI SDK
    // gives up), or a DB connectivity blip all surface as a tagged
    // `extraction_failed` state instead of a 500 + Next.js error
    // digest. Without this catch the server-side debug trace is lost
    // when the throw bubbles up, because the response never lands on
    // the client to carry it.
    try {
      // Provider resolution from the registry (`VISION_PROVIDER` env,
      // default `anthropic-haiku-4-5`). The downscaled JPEG goes
      // inline as base64 on /v1/messages; the Anthropic Files API is
      // forbidden (`pnpm anthropic-files:audit`). The provider parses
      // the model output through `LabelScanExtractionSchema`, pinning
      // `source` to `'llm_extracted'`.
      const extraction = await getDefaultVisionProvider().extractLabel(image)
      const tier = resolveConfidenceTier(extraction.confidence)
      debugAdd('ScanAction', `extraction confidence ${extraction.confidence.toFixed(2)} → tier "${tier}"`, {
        confidence: extraction.confidence,
        tier,
      })

      // Retry tier short-circuits before the lookup — there's no point
      // pinging Sakenowa when the model itself isn't confident enough
      // to want to commit to a (name, brewery) pair. The UI renders the
      // "try a closer shot" CTA. The extraction is still carried so
      // future iterations could surface "we read X but weren't sure"
      // even on retry; today the visitor just gets the localized hint.
      if (tier === 'retry') {
        return { status: 'low_confidence', extraction }
      }

      // Defensive guard against the model returning Latin where it
      // shouldn't. 2026-06-12 prompt update (§22 in the obstacles
      // doc) explicitly allows Latin in `name_ja` for the 110
      // Latin-only brands in Sakenowa (`Shangri-la`, `UMAMI`,
      // `Highland`, etc) — `findSakeByExtractionFromPool` has a
      // dedicated 5th-pass Latin lookup against `LOWER(brands.name)`.
      // So Latin name_ja is now FINE and we let it through to the
      // lookup chain.
      //
      // Brewery names, however, are essentially always in kanji in
      // Sakenowa — there's no Latin-brewery brand corpus to match
      // against, and Latin in brewery_ja is still a strong signal
      // the model misread something (rice-variety call-out
      // transliterated, retailer name romanised, etc). Keep the
      // guard for brewery_ja only. The brand-field Latin case
      // continues through.
      if (containsNoJapaneseScript(extraction.brewery_ja)) {
        debugAdd(
          'ScanAction',
          'extraction.brewery_ja is Latin-only — routing to low_confidence (brewery names should be Japanese script)',
          {
            name_ja: extraction.name_ja,
            brewery_ja: extraction.brewery_ja,
          },
          'warn',
        )
        return { status: 'low_confidence', extraction }
      }

      // Single-character brand hallucination guard. See the
      // `looksLikeSingleCharHallucination` doc comment for context —
      // a 1-character name_ja is a near-certain "high-confidence
      // coherent garbage" signal.
      //
      // Before retreating to `low_confidence`, try the brewery-only
      // fallback. Real-world motivation (2026-06-11 testing on a
      // Takashimizu bottle): across 5 attempts on the same image the
      // model returned 5 different 1-char brands (`紀, 斗, 幻, 寺田, 昇`)
      // but the brewery `高清水酒造` every time. The single-char
      // guard correctly identifies the brand as junk; routing to
      // low_confidence ignores a perfectly good brewery signal. If
      // the brewery resolves to a mono-brand brewery, we still get a
      // `matched_brewery_only` with the brand-divergence card —
      // exactly the right UX for this shape.
      if (looksLikeSingleCharHallucination(extraction.name_ja)) {
        debugAdd(
          'ScanAction',
          `extraction name_ja is a single character ("${extraction.name_ja}") — likely high-confidence hallucination, trying brewery-only fallback before low_confidence`,
          {
            name_ja: extraction.name_ja,
            brewery_ja: extraction.brewery_ja,
            confidence: extraction.confidence,
          },
          'warn',
        )
        const breweryOnly = await findSakeByBreweryOnly({
          nameJa: extraction.name_ja,
          breweryJa: extraction.brewery_ja,
        })
        if (breweryOnly.kind === 'matched_brewery_only') {
          const sakeHref = getPathname({
            locale: localeRaw,
            href: { pathname: '/sake/[brandId]', params: { brandId: String(breweryOnly.sake.brandId) } },
          })
          debugAdd('ScanAction', 'single-char guard rescued by brewery-only fallback — matched_brewery_only', {
            brandId: breweryOnly.sake.brandId,
            sakeHref,
            extractedBrand: breweryOnly.brandDivergence.extracted,
            storedBrand: breweryOnly.brandDivergence.stored,
          })
          return {
            status: 'matched_brewery_only',
            extraction,
            brandId: breweryOnly.sake.brandId,
            sakeHref,
            brandDivergence: {
              ...breweryOnly.brandDivergence,
              storedRomaji: bestRomaji(breweryOnly.sake),
            },
            breweryRomaji: bestRomaji(breweryOnly.brewery),
          }
        }
        if (breweryOnly.kind === 'ambiguous') {
          debugAdd('ScanAction', 'single-char guard + brewery-only fallback → ambiguous', {
            candidates: breweryOnly.candidates.map((c) => c.sake.brandId),
          })
          return {
            status: 'ambiguous',
            extraction,
            candidates: breweryOnly.candidates.map((c) => ambiguousCandidateFromLookup(c, localeRaw)),
          }
        }
        // Brewery-only missed. One more rescue: the model may have
        // committed a FIELD SWAP — putting the brand kanji in the
        // brewery_ja field because the brand is the prominent kanji
        // on the bottle and the real brewery (e.g. `秋田酒類製造`
        // for Takashimizu) is small / in the corner. Try a brand-only
        // lookup on the brewery_ja value. If exactly one brand
        // matches, we know what the bottle is — surface as
        // matched_brand_only with the divergence semantics "what
        // the label labelled the brewery vs the catalogue brewery
        // for the matched brand".
        debugAdd(
          'ScanAction',
          `brewery-only missed; trying brand-only on brewery_ja "${extraction.brewery_ja}" — checking for field-swap (model put brand in brewery field)`,
        )
        const swapAttempt = await findSakeByBrandOnly({
          nameJa: extraction.brewery_ja,
          breweryJa: extraction.brewery_ja,
        })
        if (swapAttempt.kind === 'matched_brand_only') {
          const sakeHref = getPathname({
            locale: localeRaw,
            href: { pathname: '/sake/[brandId]', params: { brandId: String(swapAttempt.sake.brandId) } },
          })
          debugAdd('ScanAction', 'field-swap rescue succeeded — matched_brand_only via brewery_ja', {
            brandId: swapAttempt.sake.brandId,
            sakeHref,
            extractedBrandKanji: swapAttempt.sake.nameKanji,
            extractedBrewery: extraction.brewery_ja,
            storedBrewery: swapAttempt.brewery.nameKanji,
          })
          return {
            status: 'matched_brand_only',
            extraction,
            brandId: swapAttempt.sake.brandId,
            sakeHref,
            breweryDivergence: {
              ...swapAttempt.breweryDivergence,
              storedRomaji: bestRomaji(swapAttempt.brewery),
            },
            // Field-swap path: extraction.name_ja is a single-char
            // hallucination, never a variant of the catalogue brand.
            // `preferExtractedWhenVariant` correctly returns the
            // canonical form here. We could pass `extraction.name_ja`
            // directly to be explicit; using the helper keeps the
            // two return sites symmetrical.
            sakeKanji: preferExtractedWhenVariant(extraction.name_ja, swapAttempt.sake.nameKanji),
            sakeRomaji: bestRomaji(swapAttempt.sake),
          }
        }
        if (swapAttempt.kind === 'ambiguous') {
          debugAdd('ScanAction', 'field-swap rescue → ambiguous', {
            candidates: swapAttempt.candidates.map((c) => c.sake.brandId),
          })
          return {
            status: 'ambiguous',
            extraction,
            candidates: swapAttempt.candidates.map((c) => ambiguousCandidateFromLookup(c, localeRaw)),
          }
        }
        // Field-swap rescue also missed. Brand was probably
        // hallucinated AND the brewery field doesn't correspond to
        // any known brand or brewery. Fall through to low_confidence.
        debugAdd('ScanAction', 'single-char guard + brewery-only + field-swap rescue all missed — routing to low_confidence')
        return { status: 'low_confidence', extraction }
      }

      const lookup = await findSakeByExtraction({
        nameJa: extraction.name_ja,
        breweryJa: extraction.brewery_ja,
      })

      if (lookup.kind === 'exact') {
        const sakeHref = getPathname({
          locale: localeRaw,
          href: { pathname: '/sake/[brandId]', params: { brandId: String(lookup.sake.brandId) } },
        })
        // Fetch the brewery for its romaji — the first-pass SQL
        // joins through brewery for the WHERE but doesn't select
        // brewery columns. Cheap extra round-trip on the happy path
        // is the simplest path to a non-null `breweryRomaji` on the
        // confirm card. `lookupBreweryByBrand` may return null if a
        // race deleted the brewery between the two queries — UI
        // tolerates a null romaji.
        const brewery = await lookupBreweryByBrand(lookup.sake.brandId)
        debugAdd('ScanAction', 'returning matched', {
          brandId: lookup.sake.brandId,
          sakeHref,
        })
        return {
          status: 'matched',
          extraction,
          brandId: lookup.sake.brandId,
          sakeHref,
          sakeRomaji: bestRomaji(lookup.sake),
          breweryRomaji: brewery ? bestRomaji(brewery) : null,
        }
      }
      if (lookup.kind === 'matched_brand_only') {
        const sakeHref = getPathname({
          locale: localeRaw,
          href: { pathname: '/sake/[brandId]', params: { brandId: String(lookup.sake.brandId) } },
        })
        debugAdd('ScanAction', 'returning matched_brand_only — brewery divergence surfaced', {
          brandId: lookup.sake.brandId,
          sakeHref,
          extractedBrewery: lookup.breweryDivergence.extracted,
          storedBrewery: lookup.breweryDivergence.stored,
        })
        return {
          status: 'matched_brand_only',
          extraction,
          brandId: lookup.sake.brandId,
          sakeHref,
          breweryDivergence: {
            ...lookup.breweryDivergence,
            storedRomaji: bestRomaji(lookup.brewery),
          },
          // Standard brand-only fallback path: if the visitor's
          // extracted kanji is a 旧/新 variant of the canonical
          // catalogue form, show the visitor's form so the card
          // matches the bottle in hand. Otherwise fall back to the
          // catalogue form.
          sakeKanji: preferExtractedWhenVariant(extraction.name_ja, lookup.sake.nameKanji),
          sakeRomaji: bestRomaji(lookup.sake),
        }
      }
      if (lookup.kind === 'matched_brewery_only') {
        const sakeHref = getPathname({
          locale: localeRaw,
          href: { pathname: '/sake/[brandId]', params: { brandId: String(lookup.sake.brandId) } },
        })
        debugAdd('ScanAction', 'returning matched_brewery_only — brand divergence surfaced', {
          brandId: lookup.sake.brandId,
          sakeHref,
          extractedBrand: lookup.brandDivergence.extracted,
          storedBrand: lookup.brandDivergence.stored,
        })
        return {
          status: 'matched_brewery_only',
          extraction,
          brandId: lookup.sake.brandId,
          sakeHref,
          brandDivergence: {
            ...lookup.brandDivergence,
            storedRomaji: bestRomaji(lookup.sake),
          },
          breweryRomaji: bestRomaji(lookup.brewery),
        }
      }
      if (lookup.kind === 'ambiguous') {
        debugAdd('ScanAction', 'returning ambiguous', {
          candidates: lookup.candidates.map((c) => c.sake.brandId),
        })
        return {
          status: 'ambiguous',
          extraction,
          candidates: lookup.candidates.map((c) => ambiguousCandidateFromLookup(c, localeRaw)),
        }
      }
      debugAdd('ScanAction', 'returning no_match', {
        attempted: { name_ja: extraction.name_ja, brewery_ja: extraction.brewery_ja },
      })
      return { status: 'no_match', extraction }
    } catch (err) {
      const name = err instanceof Error ? err.name : 'UnknownError'
      const message = err instanceof Error ? err.message : String(err)
      // `AI_NoObjectGeneratedError` fires when the AI SDK's
      // `generateObject` exhausts schema-validation retries — the
      // typical cause is a non-sake image: the model correctly
      // refuses to invent a sake name, returns empty fields, our
      // `min(1)` schema rejects them, the SDK retries, gives up.
      // That's a healthy outcome — not a system error — so we
      // surface it at `warn` level (yellow ⚠ in the panel) instead
      // of `error` (red ✗). Real outages (Anthropic 5xx, network
      // blip, TypeError) keep the `error` level.
      const isExpectedNoObject = name === 'AI_NoObjectGeneratedError'
      debugAdd(
        'ScanAction',
        `extraction threw: ${name}`,
        // The full message is for the debug overlay only — the
        // tagged state passed to the UI carries just the error name
        // so localized copy stays generic. We slice to 500 chars to
        // bound the panel rendering cost on a degenerate trace.
        { message: message.slice(0, 500) },
        isExpectedNoObject ? 'warn' : 'error',
      )
      return { status: 'extraction_failed', reason: name }
    }
  })

  // Attach the accumulated trace to the response. Stripped when debug
  // is off so non-debug visitors never see it.
  return log ? { ...result, debugLog: log.toArray() } : result
}

interface RateLimitDecision {
  allowed: boolean
  retryAfterSec: number
}

/**
 * Issues / refreshes the `yawaragi_session` cookie and consults the
 * `vision-scan` bucket. Returns `{allowed: false, retryAfterSec}` when
 * either of the two identifiers (signed cookie sid, hashed IP) has
 * exhausted its 24h budget.
 *
 * Production demands the full env triplet — failing closed is the only
 * safe mode for a rate-limiter, since silently bypassing defeats the
 * cost-protection point of this slice. Non-production skips with a
 * console warning so local dev and the existing S1 happy-path E2E
 * keep working on machines without Upstash credentials.
 */
async function enforceRateLimit(): Promise<RateLimitDecision> {
  // Production fail-closed: any missing key throws (with the specific
  // key name) before we touch the cookie or KV. Non-production returns
  // null and we skip enforcement with a warning. The check is extracted
  // so the prod-throw branch is unit-testable per-variable — see
  // `config-gate.test.ts`. The same gate runs at boot in
  // `src/instrumentation.ts`, so a misconfigured Production deploy
  // fails at cold start rather than at first scan request.
  const config = assertRateLimitConfig(
    {
      secret: env.SESSION_COOKIE_SECRET,
      salt: env.IP_HASH_SALT,
      kvUrl: env.UPSTASH_REDIS_REST_URL,
      kvToken: env.UPSTASH_REDIS_REST_TOKEN,
    },
    process.env.NODE_ENV === 'production',
  )
  if (!config) {
    console.warn(
      '[scan] rate-limit env not set; skipping enforcement (non-production only).',
    )
    debugAdd('RateLimit', 'env unset → skipping enforcement (non-production)', undefined, 'warn')
    return { allowed: true, retryAfterSec: 0 }
  }
  const { secret, salt, kvUrl, kvToken } = config

  const cookieJar = await cookies()
  const requestHeaders = await headers()

  const existing = readAnonymousSessionCookie(cookieJar, secret)
  const attrs = anonymousSessionCookieAttrs(secret, existing ?? undefined)
  // Write the cookie back unconditionally — fresh issuance mints a new
  // sid, refresh slides the ts forward (24h sliding TTL).
  cookieJar.set(attrs)
  // Re-parse from the freshly-minted value so we have the canonical sid
  // for the rate-limit key (rather than reaching into the helper's
  // internals to extract it). A miss here would be a bug in the cookie
  // helper itself — we surface it as a hard error rather than continuing
  // without an identifier.
  const session = readAnonymousSessionCookie(
    { get: () => ({ value: attrs.value }) },
    secret,
  )
  if (!session) {
    throw new Error('Failed to verify a freshly-issued session cookie')
  }

  const ipHashed = hashIp(extractIp(requestHeaders), salt)
  const kv = new UpstashKVClient(kvUrl, kvToken)
  const result = await anonymousRateLimit(
    { cookieId: session.sid, ipHashed, bucket: 'vision-scan' },
    { kv },
  )

  debugAdd(
    'RateLimit',
    result.allowed
      ? `allowed (${result.remaining} remaining in vision-scan bucket)`
      : `denied — retryAfter ${result.retryAfterSec}s`,
    {
      bucket: 'vision-scan',
      cookieKey: `rl:vision-scan:cookie:${session.sid.slice(0, 8)}…`,
      allowed: result.allowed,
    },
    result.allowed ? 'info' : 'warn',
  )

  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec }
}
