import { DebugLog, runWithDebugLog } from '@/lib/debug/debug-log'
import type { Admission, CookieJar, Meter, MeteredCallOptions, MeterRefusal } from './metered-call'

/**
 * A stand-in for `meteredCall` in a surface's unit tests, so they test what
 * the surface does with an admitted or refused request without stubbing
 * cookies, Clerk, the session cookie and Upstash. The meter itself — the
 * rate limit before the paid step, the bypass, the debug log — is tested
 * once, in `metered-call.test.ts`.
 *
 *     vi.mock('@/lib/metering/metered-call', () => import('@/lib/metering/fake-metered-call'))
 *
 * Set `fakeMeter.next` to refuse a request, `fakeMeter.cookies` for what the
 * body reads off the jar, `fakeMeter.debug` to get a debug log back; call
 * `resetFakeMeter()` between tests.
 */
export const fakeMeter = {
  /** What `pay` does: admit (with this much budget left) or refuse. */
  next: {} as Admission | MeterRefusal,
  /** The cookies the body sees on `meter.cookieJar`. */
  cookies: {} as Record<string, string>,
  /** Whether to open a debug log and attach it, as with the debug cookie set. */
  debug: false,
  /** Every call: its options, whether its body paid, and what it counted. */
  calls: [] as { bucket: string; span?: string; paid: boolean; counted: string | null }[],
}

export function resetFakeMeter(): void {
  fakeMeter.next = {}
  fakeMeter.cookies = {}
  fakeMeter.debug = false
  fakeMeter.calls = []
}

export async function meteredCall<T extends object>(
  options: MeteredCallOptions<T>,
  run: (meter: Meter) => Promise<T>,
): Promise<T> {
  const call: (typeof fakeMeter.calls)[number] = {
    bucket: options.bucket,
    ...(options.span ? { span: options.span.name } : {}),
    paid: false,
    counted: null,
  }
  fakeMeter.calls.push(call)
  const cookies = fakeMeter.cookies
  const cookieJar = {
    get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
  } as unknown as CookieJar
  const meter: Meter = {
    cookieJar,
    async pay(step) {
      if (call.paid) throw new Error('meteredCall: a request pays its rate limit once')
      call.paid = true
      const next = fakeMeter.next
      if ('status' in next) return next
      return step(next)
    },
  }
  const log = fakeMeter.debug ? new DebugLog() : undefined
  const body = await runWithDebugLog(log, () => run(meter))
  const result: T = log ? { ...body, debugLog: log.toArray() } : body
  call.counted = options.count?.(result) ?? null
  return result
}
