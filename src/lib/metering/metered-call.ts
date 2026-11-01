import 'server-only'

import { cookies } from 'next/headers'
import { withActionSpan, type ActionOutcome } from '@/lib/ai/observability/action-span'
import { isDebugEnabled } from '@/lib/debug/debug-access'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import type { RateLimitBucket } from '@/lib/rate-limit/anonymous-rate-limit'
import { enforceRateLimit } from '@/lib/rate-limit/enforce-rate-limit'
import { countUsage } from '@/lib/stats/count-usage'
import type { UsageEvent } from '@/lib/stats/usage-counters'

/**
 * One metered request: the envelope every surface that spends a visitor's
 * anonymous budget runs in — the label scan, the menu or shelf read, the
 * suggestions, the taste events.
 *
 * In order, it:
 *
 *  1. opens the surface's Langfuse action span (when it names one), so the
 *     outcome the surface returns is classified at one boundary;
 *  2. reads the request's cookies once and, when the visitor has debug on,
 *     opens the per-request debug log every `debugAdd(...)` below appends
 *     to — attached to the result as `debugLog`, and absent otherwise;
 *  3. runs the surface's body, which pays for its paid step through
 *     `meter.pay(...)`: the rate limit for `bucket` is taken first, and only
 *     an admitted request runs the step. A spent budget or a missing session
 *     cookie comes back as `rate_limited` / `session_missing` and the paid
 *     step — the model call, the store write — never runs. This is the
 *     cost-protection invariant, and it lives here, tested once
 *     (`metered-call.test.ts`);
 *  4. adds one to the usage counter the surface picks from its result.
 *
 * A body may return before paying (a bad form, a photo answered from the
 * read cache): nothing is charged. It may pay at most once.
 *
 * `RATE_LIMIT_BYPASS`, the maintainer escape hatch and the non-production
 * "no rate-limit env" skip are `enforceRateLimit`'s, unchanged.
 */

/** The request's cookie jar, as `next/headers` hands it out. */
export type CookieJar = Awaited<ReturnType<typeof cookies>>

/** What a request the meter turned away gets back instead of the paid step's result. */
export type MeterRefusal = { status: 'session_missing' } | { status: 'rate_limited'; retryAfterSec: number }

/** What an admitted request learns: the visitor's budget left after this call, where one is counted. */
export interface Admission {
  remaining?: number
}

export interface Meter {
  /** The request's cookies, read once for the debug check and handed on. */
  readonly cookieJar: CookieJar
  /**
   * Take the rate limit, then run `paid` if it was admitted. Call it at most
   * once per request, right before the step that costs money.
   */
  pay<R>(paid: (admission: Admission) => Promise<R>): Promise<R | MeterRefusal>
}

export interface MeteredCallOptions<T> {
  /** Which anonymous budget this request spends. */
  bucket: RateLimitBucket
  /** Console prefix identifying the surface, e.g. `[scan]`. */
  logPrefix: string
  /**
   * The Langfuse action span around the whole call. Omitted by a surface
   * with no span (taste) or one that opens its own around work that must
   * happen before any cookie is read (suggest checks its seed first).
   */
  span?: {
    /** kebab-case action name, e.g. `scan-action`. Langfuse filters on it. */
    name: string
    metadata?: Record<string, unknown>
    classify: (result: T) => ActionOutcome
  }
  /** The usage counter for this result, or null to count nothing. */
  count?: (result: T) => UsageEvent | null
}

/**
 * Run one metered request. `T` is the surface's result state; each one
 * already declares an optional `debugLog`, which the meter fills in.
 */
export async function meteredCall<T extends object>(
  options: MeteredCallOptions<T>,
  run: (meter: Meter) => Promise<T>,
): Promise<T> {
  const call = () => runMetered(options, run)
  const result = options.span ? await withActionSpan(options.span, call) : await call()
  const event = options.count?.(result)
  if (event) countUsage(event)
  return result
}

async function runMetered<T extends object>(
  { bucket, logPrefix }: MeteredCallOptions<T>,
  run: (meter: Meter) => Promise<T>,
): Promise<T> {
  const cookieJar = await cookies()
  const log = (await isDebugEnabled(cookieJar)) ? new DebugLog() : undefined

  let paid = false
  const meter: Meter = {
    cookieJar,
    async pay(step) {
      if (paid) throw new Error(`${logPrefix} meteredCall: a request pays its rate limit once`)
      paid = true
      const decision = await enforceRateLimit({ bucket, logPrefix, debug: debugAdd })
      if (decision.kind === 'session_missing') return { status: 'session_missing' }
      if (!decision.allowed) return { status: 'rate_limited', retryAfterSec: decision.retryAfterSec }
      return step(decision.remaining === undefined ? {} : { remaining: decision.remaining })
    },
  }

  const result = await runWithDebugLog(log, () => run(meter))
  // Stripped when debug is off, so a visitor without it never sees the trace.
  return log ? { ...result, debugLog: log.toArray() } : result
}
