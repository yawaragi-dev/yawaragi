'use server'

import { cookies } from 'next/headers'
import { getPathname } from '@/i18n/navigation'
import { ARRIVED_VIA_SCAN_QUERY } from '@/lib/scan/arrived-via-scan'
import { ownBottlingForRead } from '@/lib/scan/read-bottling'
import { notOneBottleOfSake } from '@/lib/scan/read-kind'
import { resolveViewerJournal } from '@/lib/taste/viewer-journal'
import type { Locale } from '@/i18n/routing'
import { routing } from '@/i18n/routing'
import {
  getVisionProvider,
  DEFAULT_VISION_PROVIDER_KEY,
  TIER_2_VISION_PROVIDER_KEY,
} from '@/lib/ai/vision/registry'
import type { VisionProvider } from '@/lib/ai/vision/vision-provider'
import { recordActionMetadata, withActionSpan } from '@/lib/ai/observability/action-span'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { enforceRateLimit } from '@/lib/rate-limit/enforce-rate-limit'
import { isKanjiVariant } from '@/lib/sakenowa/kanji-variants'
import { lookupBreweryByBrand, lookupFlavorChart } from '@/lib/sakenowa/lookup'
import {
  resolveScannedLabel,
  type ResolveScannedLabelResult,
} from '@/lib/sakenowa/resolve-scanned-label'
import { resolveWithEarlierRead } from '@/lib/sakenowa/resolve-with-earlier-read'
import { findNearestBrands, type NearestBrand } from '@/lib/sakenowa/nearest-brands'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import { parseEarlierScanRead, type EarlierScanRead } from '@/lib/schemas/earlier-scan-read'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import type { ScanActionState, ScanCandidate } from './scan-action-state'
import { CONFIDENCE_AUTO_THRESHOLD } from './confidence-tier'
import { classifyScanOutcome } from './scan-outcome'

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
 *     `DEFAULT_VISION_PROVIDER_KEY`; the Playwright spec overrides with
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
  prefectureName: string | null
} {
  return {
    brandId: c.sake.brandId,
    sakeHref: sakeHrefFor(c.sake.brandId, locale),
    nameKanji: c.sake.nameKanji,
    nameRomaji: bestRomaji(c.sake),
    breweryKanji: c.brewery.nameKanji,
    breweryRomaji: bestRomaji(c.brewery),
    // Prefecture name from the static editorial area map
    // (manual_curation). Deterministic, no DB round-trip — the
    // brewery row the lookup already JOINed carries `areaId`, and
    // `getPrefectureNames` resolves it against the fixed 47-entry
    // table (+ the "International" sentinel for areaId 0). `nameEn`
    // is a proper noun and reads identically in EN and DE.
    prefectureName: getPrefectureNames(c.brewery.areaId)?.nameEn ?? null,
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
  // #287 slice D — one Langfuse span per scan, with the tier-2 retry rate
  // recorded on it. Sonnet 4.6 costs ~6x Haiku and fires on every tier-1
  // status except a clean `matched`, so the retry rate is the dominant
  // driver of scan spend and nothing tracked it before.
  return withActionSpan(
    { name: 'scan-action', classify: classifyScanOutcome },
    () => runScanAction(_prev, formData),
  )
}

async function runScanAction(
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
    // #408: what the previous scan in this tab read, if the visitor is
    // photographing another side. Never passed to the vision call — the
    // photo is read blind — and consulted only after this scan has its own
    // answer. Malformed or absent is the same as a first scan.
    const earlierRead = parseEarlierScanRead(formData.get('earlierRead'))

    // Rate-limit gate. Post-#161 middleware refactor: reads the
    // `yawaragi_session` cookie the proxy stamped before render and
    // consults the vision-scan bucket. Never mutates the cookie —
    // `src/proxy.ts` is the sole writer, so calling `cookies().set(...)`
    // from an action invoked mid-render (like the suggest surface) no
    // longer crashes with `Cookies can only be modified in a Server
    // Action or Route Handler`. On exhaustion the action returns the
    // tagged `rate_limited` state and never reaches the vision provider.
    const rateLimit = await enforceRateLimit({
      bucket: 'vision-scan',
      logPrefix: '[scan]',
      debug: debugAdd,
    })
    if (rateLimit.kind === 'session_missing') {
      return { status: 'session_missing' }
    }
    if (!rateLimit.allowed) {
      return { status: 'rate_limited', retryAfterSec: rateLimit.retryAfterSec }
    }

    // Two-tier vision strategy. Tier 1 is the cheap model
    // (`DEFAULT_VISION_PROVIDER_KEY`), sufficient for clear bottles.
    // Tier 2 (`TIER_2_VISION_PROVIDER_KEY`) is materially better at
    // brush-style calligraphic kanji on busy backgrounds, at many times
    // the cost per call. The examples below date from the Haiku 4.5 /
    // Sonnet 4.6 pair; the rule is unchanged. Retry on every tier-1
    // status EXCEPT a clean `matched` (first-pass exact):
    //
    //   - `no_match` / `low_confidence` / `extraction_failed`:
    //     no result at all from tier-1.
    //   - `matched_brand_only` / `matched_brewery_only`: tier-1
    //     resolved a brand+brewery PARTIALLY but the divergence is
    //     a strong "the model misread at least one field" signal.
    //     Real-world bite (Kiku-Masamune, 2026-06-14): Haiku read
    //     the descriptor "JUNMAI TARU SAKE" as the brand and the
    //     brewery as a fabricated `菊宮`; the Latin first-word-strip
    //     variant matched a generic `junmai`-named brand 3506 with
    //     diverged brewery, surfacing a confident-looking divergence
    //     card pointing at completely the wrong sake. Sonnet on the
    //     same image reads `菊正宗` cleanly.
    //   - `ambiguous`: Sakenowa returned multiple candidates because
    //     tier-1's extraction was field-swapped or otherwise
    //     under-specified. Real-world bite (Kiku-Masamune
    //     taru-sake, 2026-06-14): Haiku field-swapped (descriptor
    //     "JUNMAI TARU SAKE" in name_ja, the actual brand "菊正宗"
    //     in brewery_ja) and the brewery-only fallback found 4
    //     real 菊正宗 candidates. Sonnet on the same image returns
    //     a clean (name_ja: 菊正宗, brewery_ja: 菊正宗酒造) → first-
    //     pass exact match. Genuine catalogue-side ambiguity
    //     (e.g. `Kubota` with multiple sub-lines) still pays the
    //     retry cost without UX improvement, but the field-swap
    //     case is more common than catalogue-side ambiguity for
    //     the DACH-focused launch corpus.
    //
    // The only outcome we KEEP from tier-1 is `matched` (first-pass
    // exact). Sakenowa resolved unambiguously; Sonnet retry would
    // just re-read the same extraction at higher cost. `rate_limited`
    // and `invalid_input` never reach this branch.
    //
    // One exception: a `matched` whose brewery the model says is not
    // printed in the photo. Brand and brewery then agree only because
    // the model supplied the brewery of the brand it read, so a misread
    // brand passes as an exact match. Real bite (Dewazakura Yukimegami,
    // front, 2026-10-13): tier 1 read the brush kanji as 獺祭 and added
    // 旭酒造 in every fresh run, at 0.80-0.92; tier 2 read 出羽桜 each
    // time and was never asked. On the 79-photo eval this sends 14 more
    // photos to tier 2 and turns that one wrong answer right, with no
    // answer made worse.
    //
    // A photo that comes with an earlier read (#408) goes straight to tier
    // 2. The earlier photo did not settle on a sake, so the bottle is one
    // the cheap model has trouble with, and waiting for it first only adds
    // its seconds. Replayed on the 118-photo eval for every second photo of
    // a bottle whose first photo was not a sure match (240 pairs over three
    // runs): 208 right by tier 2 alone against 205 through both tiers, and
    // a median of about 4 s against 9 s.
    if (earlierRead) {
      recordActionMetadata({
        'scan.tier1Status': 'skipped_second_photo',
        'scan.tier2Used': true,
        'scan.tier2Provider': TIER_2_VISION_PROVIDER_KEY,
      })
      return withOwnBottlings(
        await withEarlierRead(
          await withNearestCandidates(
            await extractAndLookupWithProvider(getVisionProvider(TIER_2_VISION_PROVIDER_KEY), image, localeRaw),
            localeRaw,
          ),
          earlierRead,
          localeRaw,
        ),
      )
    }
    const tier1Result = await extractAndLookupWithProvider(
      getVisionProvider(DEFAULT_VISION_PROVIDER_KEY),
      image,
      localeRaw,
    )
    const tier1BreweryNotPrinted =
      tier1Result.status === 'matched' && tier1Result.extraction.brewery_printed === false
    if (
      tier1BreweryNotPrinted ||
      // "Not sake" and "not one bottle" end the scan without a lookup, so
      // they are tier 2's to say. On the 118-photo eval tier 1 called two
      // single bottles "several bottles" (one of them a sake); tier 2 made
      // no such mistake, and neither model called a sake anything else.
      tier1Result.status === 'not_sake' ||
      tier1Result.status === 'not_one_bottle' ||
      tier1Result.status === 'no_match' ||
      tier1Result.status === 'low_confidence' ||
      tier1Result.status === 'extraction_failed' ||
      tier1Result.status === 'matched_brand_only' ||
      tier1Result.status === 'matched_brewery_only' ||
      tier1Result.status === 'ambiguous'
    ) {
      debugAdd(
        'ScanAction',
        `tier-1 (Haiku) returned ${tier1Result.status} — retrying with tier-2 (${TIER_2_VISION_PROVIDER_KEY})`,
        { tier1Status: tier1Result.status, tier1BreweryNotPrinted },
        'warn',
      )
      // The cost signal. `scan.tier2Used` over all scans gives the retry
      // rate; `scan.tier1Status` says WHICH tier-1 outcome is driving it,
      // which is what tells you whether to tune the prompt, the confidence
      // thresholds, or the tier-1 model itself.
      recordActionMetadata({
        'scan.tier1Status': tier1BreweryNotPrinted ? 'matched_brewery_not_printed' : tier1Result.status,
        'scan.tier2Used': true,
        'scan.tier2Provider': TIER_2_VISION_PROVIDER_KEY,
      })
      return withOwnBottlings(
        await withEarlierRead(
          await withNearestCandidates(
            await extractAndLookupWithProvider(getVisionProvider(TIER_2_VISION_PROVIDER_KEY), image, localeRaw),
            localeRaw,
          ),
          earlierRead,
          localeRaw,
        ),
      )
    }
    // Recorded on the cheap path too — a retry RATE needs the denominator,
    // not just the numerator.
    recordActionMetadata({
      'scan.tier1Status': tier1Result.status,
      'scan.tier2Used': false,
    })
    return withOwnBottlings(
      await withEarlierRead(await withNearestCandidates(tier1Result, localeRaw), earlierRead, localeRaw),
    )
  })

  // Attach the accumulated trace to the response. Stripped when debug
  // is off so non-debug visitors never see it.
  return log ? { ...result, debugLog: log.toArray() } : result
}

/**
 * Guesses for the answer the visitor will see: §5a "Did you mean" on a
 * `no_match`, and §5's "Not sure?" list under a Best-guess match (0.60–0.84,
 * the match itself left out). Applied once, not inside the per-tier pipeline
 * — a tier-1 `no_match` is always retried, and reading the catalogue for a
 * result that is thrown away is wasted work. A sure match asks nothing.
 */
async function withNearestCandidates(state: ScanActionState, locale: Locale): Promise<ScanActionState> {
  const read = (extraction: LabelScanExtraction) => ({ name: extraction.name_ja, brewery: extraction.brewery_ja })
  const toCandidate = ({ row, reason, sameBrewery }: NearestBrand): ScanCandidate => ({
    brandId: row.brandId,
    sakeHref: sakeHrefFor(row.brandId, locale),
    nameKanji: row.nameKanji,
    nameRomaji: row.nameRomaji,
    breweryKanji: row.breweryKanji,
    breweryRomaji: row.breweryRomaji,
    prefectureName: row.areaId === null ? null : (getPrefectureNames(row.areaId)?.nameEn ?? null),
    reason,
    sameBrewery,
  })

  if (state.status === 'no_match') {
    return { ...state, candidates: (await findNearestBrands(read(state.extraction))).map(toCandidate) }
  }
  if (state.status === 'matched' && state.extraction.confidence < CONFIDENCE_AUTO_THRESHOLD) {
    const others = await findNearestBrands(read(state.extraction), { exclude: state.brandId })
    return { ...state, otherCandidates: others.map(toCandidate) }
  }
  return state
}

/**
 * #408: a scan that did not land on one sake, looked at again with what the
 * visitor's previous photo read. The rules — this photo's own answer always
 * stands, the earlier read only fills a gap, and only for the same bottle —
 * live in `resolveWithEarlierRead`. Here the guess is attached BESIDE the
 * outcome, which is left exactly as it was: the two photos may be two
 * bottles, and then the outcome is the true answer and the guess is not.
 *
 * Never fails the scan: a lookup error here costs the guess, nothing else.
 */
async function withEarlierRead(
  state: ScanActionState,
  earlierRead: EarlierScanRead | null,
  locale: Locale,
): Promise<ScanActionState> {
  if (earlierRead === null) return state
  if (state.status !== 'no_match' && state.status !== 'ambiguous' && state.status !== 'low_confidence') {
    recordActionMetadata({ 'scan.earlierRead': 'not_needed' })
    return state
  }
  try {
    const own = await resolveScannedLabel(state.extraction)
    const guess = await resolveWithEarlierRead(state.extraction, own, earlierRead)
    recordActionMetadata({ 'scan.earlierRead': guess ? 'guess' : 'no_guess' })
    if (!guess) return state

    const brewery = await lookupBreweryByBrand(guess.sake.brandId)
    return {
      ...state,
      bothPhotos: {
        brandId: guess.sake.brandId,
        sakeHref: sakeHrefFor(guess.sake.brandId, locale),
        nameKanji: guess.sake.nameKanji,
        nameRomaji: bestRomaji(guess.sake),
        breweryKanji: brewery?.nameKanji ?? null,
        breweryRomaji: brewery ? bestRomaji(brewery) : null,
        prefectureName: brewery ? (getPrefectureNames(brewery.areaId)?.nameEn ?? null) : null,
      },
    }
  } catch (err) {
    debugAdd('ScanAction', 'combining with the earlier read threw; keeping this scan as it is', {
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    }, 'warn')
    return state
  }
}

/**
 * Adds the visitor's own bottlings of the matched sake, the one the label
 * points at first (design v1.6 §5, "Is it one of these bottlings?"). The
 * catalogue stops at the sake; the label names the bottling, and a visitor
 * who added it before should land on it rather than add it twice.
 *
 * Only a match has a sake to hang bottlings on, and only a visitor who
 * keeps a journal has any. A failure here leaves the scan as it was.
 */
async function withOwnBottlings(state: ScanActionState): Promise<ScanActionState> {
  if (state.status !== 'matched') return state
  try {
    const viewer = await resolveViewerJournal(await cookies())
    const own = viewer.expressions.filter((e) => e.brandId === state.brandId)
    if (own.length === 0) return state
    const fits = ownBottlingForRead(state.extraction.bottling, own)
    const rows = own.map((e) => ({
      id: e.id,
      name: e.name,
      fitsLabel: e.id === fits?.id,
      ...(e.grade ? { grade: e.grade } : {}),
      ...(e.styles ? { styles: e.styles } : {}),
    }))
    return { ...state, ownBottlings: rows.sort((a, b) => Number(b.fitsLabel) - Number(a.fitsLabel)) }
  } catch (err) {
    debugAdd('ScanAction', 'reading the visitor’s own bottlings threw; the match stands without them', {
      message: err instanceof Error ? err.message.slice(0, 300) : String(err),
    }, 'warn')
    return state
  }
}

/**
 * Tier-agnostic extraction + label-resolution pipeline. Takes a
 * `VisionProvider` so `scanAction` can run it with Haiku first and
 * Sonnet on retry (see the two-tier comment in `scanAction`).
 *
 * The matching itself — every pre-lookup guard AND the 5-pass Sakenowa
 * cascade — lives behind `resolveScannedLabel` (#198); this function is
 * now just vision → resolve → map-to-render-state, wrapped in a single
 * try/catch. Throws are caught and surfaced as `extraction_failed`, so
 * an Anthropic outage / schema-validation retry exhaustion / DB blip
 * lands as a tagged state with the debug trace intact rather than a 500
 * + Next.js error digest. The server-side debug trace would otherwise
 * be lost because the response never lands on the client to carry it.
 */
async function extractAndLookupWithProvider(
  provider: VisionProvider,
  image: Blob,
  localeRaw: Locale,
): Promise<ScanActionState> {
    try {
      // The downscaled JPEG goes inline as base64 on /v1/messages;
      // the Anthropic Files API is forbidden (`pnpm
      // anthropic-files:audit`). The provider parses the model output
      // through `LabelScanExtractionSchema`, pinning `source` to
      // `'llm_extracted'`.
      const extraction = await provider.extractLabel(image)
      const other = notOneBottleOfSake(extraction)
      if (other?.kind === 'not_one_bottle') return { status: 'not_one_bottle', extraction, subject: other.subject }
      if (other?.kind === 'not_sake') return { status: 'not_sake', extraction, drink: other.drink }
      const resolved = await resolveScannedLabel(extraction)
      return mapResolvedToState(resolved, extraction, localeRaw)
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
}

/**
 * Locale-aware `/sake/[brandId]` pathname. Every matched arm — and every
 * ambiguous candidate — links to the same detail route; centralising the
 * `getPathname` call keeps the arms uniform. The `?from=scan` query is what
 * lets the bottle page offer "Not the bottle you scanned?" and show the
 * visitor's photo (see `arrived-via-scan.ts`).
 */
function sakeHrefFor(brandId: number, locale: Locale): string {
  return getPathname({
    locale,
    href: {
      pathname: '/sake/[brandId]',
      params: { brandId: String(brandId) },
      query: ARRIVED_VIA_SCAN_QUERY,
    },
  })
}

/**
 * Maps a `resolveScannedLabel` result onto the wire-shape the client
 * `useActionState` renders. The matching decisions are already made
 * upstream (#198); this is pure presentation shaping — locale-aware
 * hrefs, romaji distillation, the flavor-chart + brewery round-trips
 * on the exact-match happy path, and the kanji-variant display
 * preference. `low_confidence` (the guards' "couldn't read clearly"
 * signal) and `no_match` (the catalogue genuinely lacks the brand) are
 * distinct UI states and stay distinct here.
 */
async function mapResolvedToState(
  resolved: ResolveScannedLabelResult,
  extraction: LabelScanExtraction,
  localeRaw: Locale,
): Promise<ScanActionState> {
  switch (resolved.kind) {
    case 'low_confidence':
      return { status: 'low_confidence', extraction }

    case 'exact': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, localeRaw)
      // Fetch the brewery for its romaji and the flavor chart for the
      // in-place result card (ADR-0015). The first-pass SQL joins
      // through brewery for the WHERE but doesn't select brewery
      // columns, and `flavor_charts` is a separate table keyed on
      // brand_id. Two parallel round-trips add ~one DB hop to the happy
      // path. `lookupBreweryByBrand` may return null if a race deleted
      // the brewery between queries; the chart may be null for the
      // small tail of brands the Sakenowa `/flavor-charts` list omits.
      // UI tolerates both.
      const [brewery, flavorChart] = await Promise.all([
        lookupBreweryByBrand(resolved.sake.brandId),
        lookupFlavorChart(resolved.sake.brandId),
      ])
      debugAdd('ScanAction', 'returning matched', {
        brandId: resolved.sake.brandId,
        sakeHref,
        hasFlavorChart: flavorChart !== null,
      })
      return {
        status: 'matched',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        sakeRomaji: bestRomaji(resolved.sake),
        breweryRomaji: brewery ? bestRomaji(brewery) : null,
        flavorChart,
        // Filled by `withNearestCandidates` for a best guess.
        otherCandidates: [],
      }
    }

    case 'matched_brand_only': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, localeRaw)
      debugAdd('ScanAction', 'returning matched_brand_only — brewery divergence surfaced', {
        brandId: resolved.sake.brandId,
        sakeHref,
        extractedBrewery: resolved.breweryDivergence.extracted,
        storedBrewery: resolved.breweryDivergence.stored,
      })
      return {
        status: 'matched_brand_only',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        breweryDivergence: {
          ...resolved.breweryDivergence,
          storedRomaji: bestRomaji(resolved.brewery),
        },
        // If the visitor's extracted kanji is a 旧/新 variant of the
        // canonical catalogue form, show the visitor's form so the card
        // matches the bottle in hand. For the field-swap rescue path
        // `extraction.name_ja` is the model's single-char hallucination
        // — `preferExtractedWhenVariant` returns false there and falls
        // back to the canonical form. One branch, both cases correct.
        sakeKanji: preferExtractedWhenVariant(extraction.name_ja, resolved.sake.nameKanji),
        sakeRomaji: bestRomaji(resolved.sake),
      }
    }

    case 'matched_brewery_only': {
      const sakeHref = sakeHrefFor(resolved.sake.brandId, localeRaw)
      debugAdd('ScanAction', 'returning matched_brewery_only — brand divergence surfaced', {
        brandId: resolved.sake.brandId,
        sakeHref,
        extractedBrand: resolved.brandDivergence.extracted,
        storedBrand: resolved.brandDivergence.stored,
      })
      return {
        status: 'matched_brewery_only',
        extraction,
        brandId: resolved.sake.brandId,
        sakeHref,
        brandDivergence: {
          ...resolved.brandDivergence,
          storedRomaji: bestRomaji(resolved.sake),
        },
        breweryRomaji: bestRomaji(resolved.brewery),
      }
    }

    case 'ambiguous':
      debugAdd('ScanAction', 'returning ambiguous', {
        candidates: resolved.candidates.map((c) => c.sake.brandId),
      })
      return {
        status: 'ambiguous',
        extraction,
        candidates: resolved.candidates.map((c) => ambiguousCandidateFromLookup(c, localeRaw)),
      }

    case 'no_match':
      debugAdd('ScanAction', 'returning no_match', {
        attempted: { name_ja: extraction.name_ja, brewery_ja: extraction.brewery_ja },
      })
      // Filled by `withNearestCandidates` once the last tier has answered.
      return { status: 'no_match', extraction, candidates: [] }
  }
}

