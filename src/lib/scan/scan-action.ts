'use server'

import { cookies, headers } from 'next/headers'
import { env } from '@/env'
import { getPathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { routing } from '@/i18n/routing'
import {
  anonymousSessionCookieAttrs,
  readAnonymousSessionCookie,
} from '@/lib/legal/anonymous-session-cookie'
import { anonymousRateLimit } from '@/lib/rate-limit/anonymous-rate-limit'
import { extractIp, hashIp } from '@/lib/rate-limit/ip-hash'
import { UpstashKVClient } from '@/lib/rate-limit/upstash-kv-client'
import { findSakeByExtraction } from '@/lib/sakenowa/lookup'
import {
  type LabelScanExtraction,
  parseLabelScanExtraction,
} from '@/lib/schemas/label-scan-extraction'
import type { ScanActionState } from './scan-action-state'

/**
 * Phase 3 / S1 + S2 scan Server Action.
 *
 * What S1 (#106) shipped:
 *   - Accepts the FormData from the client `<ScanForm />`.
 *   - Returns a HARDCODED extraction. The vision provider seam is wired
 *     in S3 (#108); until then, the action proves out the wire shape and
 *     end-to-end happy path.
 *   - Parses the hardcoded result through `LabelScanExtractionSchema` so
 *     the source pinning is the same parse-time seam the real provider
 *     will hit, and a future broken provider can't silently regress.
 *   - Runs the real `findSakeByExtraction` against the Sakenowa mirror.
 *   - Returns a tagged-union result for `useActionState` to render.
 *
 * What S2 (#107, this slice) adds:
 *   - Issues / refreshes the `yawaragi_session` cookie (signed opaque
 *     ~16-byte id, 24h sliding TTL). The cookie's `sid` is one of two
 *     rate-limit budget keys.
 *   - Runs `anonymousRateLimit` against the `vision-scan` bucket
 *     (5 calls per identifier per 24h, sliding window). On exhaustion
 *     the action returns a tagged `rate_limited` state and the form UI
 *     renders the localized "try again in X" copy.
 *   - Neither identifier reaches Postgres or any log line. The plaintext
 *     IP is hashed inside `extractIp` → `hashIp` before it touches the
 *     rate-limit module; only the salted hash is ever a KV key.
 *
 * Out of scope for S2 (defer to later slices per #105):
 *   - Real vision call (S3 / #108)
 *   - Medium/low confidence UX states (S4)
 *   - Disambiguation list UI (S4)
 *   - Age-gate "requires_age_gate" gate-resume flow (S4 wiring; the
 *     existing proxy already keeps the result page out of reach for an
 *     un-gated visitor, so the S1 happy-path arrives at `/sake/[brandId]`
 *     only when the gate is accepted)
 */

// Hardcoded test extraction. Dassai / Asahi Shuzo — picked because it's
// the canonical sake referenced in CONTEXT.md "Language" §Sake. Confidence
// is pinned at 0.95 (high) so the happy-path UI tier resolution always
// returns `auto`.
const HARDCODED_EXTRACTION = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
} satisfies LabelScanExtraction

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
  const image = formData.get('image')
  if (!(image instanceof Blob) || image.size === 0) {
    return { status: 'invalid_input', reason: 'missing_image' }
  }
  const localeRaw = formData.get('locale')
  if (typeof localeRaw !== 'string' || !isLocale(localeRaw)) {
    return { status: 'invalid_input', reason: 'unsupported_locale' }
  }

  // Rate-limit gate. Issues / refreshes `yawaragi_session` and consults
  // the vision-scan bucket. On exhaustion the action returns the tagged
  // `rate_limited` state and never reaches the vision provider.
  const rateLimit = await enforceRateLimit()
  if (!rateLimit.allowed) {
    return { status: 'rate_limited', retryAfterSec: rateLimit.retryAfterSec }
  }

  // S1: the vision provider is stubbed. The blob is accepted but not
  // sent anywhere — S3 (#108) wires the real Haiku 4.5 call here.
  const extraction = parseLabelScanExtraction(HARDCODED_EXTRACTION)

  const lookup = await findSakeByExtraction({
    nameJa: extraction.name_ja,
    breweryJa: extraction.brewery_ja,
  })

  if (lookup.kind === 'exact') {
    const sakeHref = getPathname({
      locale: localeRaw,
      href: { pathname: '/sake/[brandId]', params: { brandId: String(lookup.sake.brandId) } },
    })
    return {
      status: 'matched',
      extraction,
      brandId: lookup.sake.brandId,
      sakeHref,
    }
  }
  if (lookup.kind === 'ambiguous') {
    return {
      status: 'ambiguous',
      extraction,
      brandIds: lookup.candidates.map((c) => c.brandId),
    }
  }
  return { status: 'no_match', extraction }
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
  const secret = env.SESSION_COOKIE_SECRET
  const salt = env.IP_HASH_SALT
  const kvUrl = env.UPSTASH_REDIS_REST_URL
  const kvToken = env.UPSTASH_REDIS_REST_TOKEN

  if (!secret || !salt || !kvUrl || !kvToken) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Rate-limit configuration missing in production — set SESSION_COOKIE_SECRET, IP_HASH_SALT, UPSTASH_REDIS_REST_URL, and UPSTASH_REDIS_REST_TOKEN.',
      )
    }
    console.warn(
      '[scan] rate-limit env not set; skipping enforcement (non-production only).',
    )
    return { allowed: true, retryAfterSec: 0 }
  }

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

  return { allowed: result.allowed, retryAfterSec: result.retryAfterSec }
}
