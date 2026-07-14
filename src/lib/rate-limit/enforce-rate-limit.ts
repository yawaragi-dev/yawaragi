import 'server-only'

import { cookies, headers } from 'next/headers'
import { env } from '@/env'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import type { debugAdd } from '@/lib/debug/debug-log'
import { anonymousRateLimit, type RateLimitBucket } from '@/lib/rate-limit/anonymous-rate-limit'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { extractIp, hashIp } from '@/lib/rate-limit/ip-hash'
import { UpstashKVClient } from '@/lib/rate-limit/upstash-kv-client'

/**
 * The outcome of a rate-limit gate, as a server action sees it.
 *
 *  - `session_missing` — the `yawaragi_session` cookie was absent (should not
 *    happen post-middleware; a defensive branch the caller maps to its own
 *    `session_missing` state, never a bypass).
 *  - `denied` — either identifier (cookie or hashed IP) exhausted its budget.
 *  - `allowed` — the call may proceed.
 */
export type RateLimitDecision =
  | { kind: 'allowed'; allowed: true; retryAfterSec: number }
  | { kind: 'denied'; allowed: false; retryAfterSec: number }
  | { kind: 'session_missing' }

/**
 * Optional structured-debug sink. Mirrors the exact type of `debugAdd` from
 * `@/lib/debug/debug-log` (type-only import, no runtime coupling) so scan can
 * forward its `debugAdd` and have the rate-limit decision show up in the scan
 * debug panel; suggest (and the taste actions) pass nothing.
 */
export type RateLimitDebug = typeof debugAdd

export interface EnforceRateLimitOptions {
  /** Which budget to consult; keys are isolated per bucket. */
  bucket: RateLimitBucket
  /** Console log prefix identifying the surface, e.g. `[suggest]`, `[scan]`. */
  logPrefix: string
  /** Optional structured-debug sink (scan forwards `debugAdd`). */
  debug?: RateLimitDebug
}

/**
 * Shared read-only rate-limit gate for the anonymous surfaces.
 *
 * Post-#161, the proxy middleware (`src/proxy.ts`) is the SOLE writer of
 * `yawaragi_session`; this only READS the cookie and consults `bucket`, so it
 * is safe to call from an action reachable mid-RSC-render (Next.js 15 forbids
 * cookie mutation there). Production fails closed — a missing env key throws
 * via `assertRateLimitConfig` (also enforced at boot in `instrumentation.ts`);
 * non-production skips enforcement with a warning so local dev / CI without
 * Upstash keeps working.
 *
 * Extracted from the previously-duplicated `enforceRateLimit` in
 * `suggest-action.ts` and `scan-action.ts` when the taste actions became the
 * third caller (the trigger their JSDoc named). The two originals were
 * structurally identical bar the bucket, the log prefix, and scan's
 * debug-panel wiring — now the `bucket` / `logPrefix` / `debug` parameters.
 */
export async function enforceRateLimit({
  bucket,
  logPrefix,
  debug,
}: EnforceRateLimitOptions): Promise<RateLimitDecision> {
  // Dev/preview escape hatch (see env.ts `RATE_LIMIT_BYPASS`): skip the KV
  // round-trip and cookie / IP-hash read entirely. Absence is the safe
  // default. Never set on Production Vercel (boot guard in instrumentation.ts).
  if (env.RATE_LIMIT_BYPASS === '1') {
    console.warn(
      `${logPrefix} RATE_LIMIT_BYPASS=1 — rate limit skipped. Do NOT ship this in Production.`,
    )
    return { kind: 'allowed', allowed: true, retryAfterSec: 0 }
  }

  // Production fail-closed: any missing key throws (with the specific key name)
  // before we touch the cookie or KV. Non-production returns null and we skip
  // with a warning. Per-variable behaviour is unit-tested in config-gate.test.
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
    console.warn(`${logPrefix} rate-limit env not set; skipping enforcement (non-production only).`)
    debug?.('RateLimit', 'env unset → skipping enforcement (non-production)', undefined, 'warn')
    return { kind: 'allowed', allowed: true, retryAfterSec: 0 }
  }
  const { secret, salt, kvUrl, kvToken } = config

  const cookieJar = await cookies()
  const requestHeaders = await headers()

  const session = readAnonymousSessionCookie(cookieJar, secret)
  if (!session) {
    // Middleware is the sole writer post-#161. Reaching here without a cookie
    // means it didn't run for this request (matcher gap, direct invocation
    // from a test, etc.). Surface as a typed state — never throw, never bypass.
    console.warn(`${logPrefix} session cookie missing — middleware did not stamp it.`)
    debug?.(
      'RateLimit',
      'session cookie missing — middleware did not stamp it (matcher gap? direct invocation?)',
      undefined,
      'warn',
    )
    return { kind: 'session_missing' }
  }

  const ipHashed = hashIp(extractIp(requestHeaders), salt)
  const kv = new UpstashKVClient(kvUrl, kvToken)
  const result = await anonymousRateLimit({ cookieId: session.sid, ipHashed, bucket }, { kv })

  debug?.(
    'RateLimit',
    result.allowed
      ? `allowed (${result.remaining} remaining in ${bucket} bucket)`
      : `denied — retryAfter ${result.retryAfterSec}s`,
    {
      bucket,
      cookieKey: `rl:${bucket}:cookie:${session.sid.slice(0, 8)}…`,
      allowed: result.allowed,
    },
    result.allowed ? 'info' : 'warn',
  )

  return result.allowed
    ? { kind: 'allowed', allowed: true, retryAfterSec: result.retryAfterSec }
    : { kind: 'denied', allowed: false, retryAfterSec: result.retryAfterSec }
}
