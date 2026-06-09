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
import { findSakeByExtraction } from '@/lib/sakenowa/lookup'
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
 *   - For high-confidence extractions (≥ AUTO_CONFIDENCE_THRESHOLD) the
 *     existing matched / ambiguous / no_match branches still fire. For
 *     anything below the threshold the action returns a placeholder
 *     `low_confidence` state — S4 (#109) replaces this with the
 *     three-tier auto / confirm / retry UX.
 *
 * Out of scope for S3 (defer to later slices per #105):
 *   - Three-tier confidence UI (S4 / #109)
 *   - Disambiguation list UI (S4)
 *   - Age-gate "requires_age_gate" gate-resume flow (S4 wiring)
 */

/**
 * Confidence at or above which the action treats the extraction as
 * high-confidence and runs the Sakenowa lookup → matched/ambiguous/
 * no_match branches. Below this, the action returns the `low_confidence`
 * placeholder for S4 to replace. PRD #105 § "Confidence tier resolver"
 * pins 0.85 as the auto/confirm boundary; S4 will introduce the second
 * threshold (0.6) for retry vs. confirm.
 */
const AUTO_CONFIDENCE_THRESHOLD = 0.85

function isLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value)
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

    // Real vision call (S3). The provider is resolved from the registry
    // (`VISION_PROVIDER` env, default `anthropic-haiku-4-5`). The downscaled
    // JPEG goes inline as base64 on /v1/messages; the Anthropic Files API
    // is forbidden (`pnpm anthropic-files:audit`). The provider parses the
    // model output through `LabelScanExtractionSchema`, pinning `source`
    // to `'llm_extracted'`.
    const extraction = await getDefaultVisionProvider().extractLabel(image)
    debugAdd('ScanAction', `extraction confidence ${extraction.confidence.toFixed(2)}`, {
      threshold: AUTO_CONFIDENCE_THRESHOLD,
      branch: extraction.confidence < AUTO_CONFIDENCE_THRESHOLD ? 'low_confidence' : 'lookup',
    })

    // S3 placeholder for medium / low confidence. The three-tier UI lands
    // in S4 (#109); for now anything below the auto threshold falls
    // through to a tagged state the form renders as a "try a closer
    // shot" hint. The extraction is carried so S4's confirm-card can
    // reuse it without a second scan.
    if (extraction.confidence < AUTO_CONFIDENCE_THRESHOLD) {
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
      debugAdd('ScanAction', 'returning matched', {
        brandId: lookup.sake.brandId,
        sakeHref,
      })
      return {
        status: 'matched',
        extraction,
        brandId: lookup.sake.brandId,
        sakeHref,
      }
    }
    if (lookup.kind === 'ambiguous') {
      debugAdd('ScanAction', 'returning ambiguous', {
        candidates: lookup.candidates.map((c) => c.brandId),
      })
      return {
        status: 'ambiguous',
        extraction,
        brandIds: lookup.candidates.map((c) => c.brandId),
      }
    }
    debugAdd('ScanAction', 'returning no_match', {
      attempted: { name_ja: extraction.name_ja, brewery_ja: extraction.brewery_ja },
    })
    return { status: 'no_match', extraction }
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
