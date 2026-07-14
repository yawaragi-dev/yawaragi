import 'server-only'

import { env } from '@/env'
import type { TasteEventStore } from '@/lib/taste/taste-event-store'
import { UpstashTasteEventStore } from '@/lib/taste/upstash-taste-event-store'

/**
 * Construct the production {@link TasteEventStore} from env, or `null` when the
 * Upstash env pair is absent.
 *
 * Production always has the env — the boot guard in `instrumentation.ts`
 * (`assertRateLimitConfig`) asserts the rate-limit triplet, which includes the
 * Upstash pair, so a misconfigured prod deploy fails at cold start. `null`
 * therefore only occurs in non-production, where taste persistence degrades to
 * a no-op (the action returns `unavailable`) — the same posture the rate
 * limiter takes when its env is unset.
 */
export function getTasteEventStore(): TasteEventStore | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new UpstashTasteEventStore(url, token)
}
