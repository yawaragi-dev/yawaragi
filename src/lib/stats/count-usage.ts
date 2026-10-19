import 'server-only'

import { after } from 'next/server'
import { env } from '@/env'
import { recordUsageEvent, type UsageEvent } from './usage-counters'

/**
 * Adds one to today's tally for `event` once the response has gone out, so a
 * count never slows a page or an action, and a failed one is only logged.
 * Without Upstash (CI, a fresh checkout) it does nothing.
 */
export function countUsage(event: UsageEvent): void {
  const restUrl = env.UPSTASH_REDIS_REST_URL
  const restToken = env.UPSTASH_REDIS_REST_TOKEN
  if (!restUrl || !restToken) return
  const scope = env.VERCEL_ENV ?? 'local'
  try {
    after(() => recordUsageEvent(event, { restUrl, restToken, scope }))
  } catch {
    // Outside a request (a script, a unit test): nothing to count.
  }
}
