import 'server-only'

import { env } from '@/env'
import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import { UpstashBottleHistoryStore } from '@/lib/collection/upstash-bottle-history-store'

/**
 * The production {@link BottleHistoryStore}, or `null` when the Upstash env
 * pair is absent — the mirror of `getCellarStore()`, sharing its database and
 * its degrade-to-unavailable posture.
 */
export function getBottleHistoryStore(): BottleHistoryStore | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new UpstashBottleHistoryStore(url, token)
}
