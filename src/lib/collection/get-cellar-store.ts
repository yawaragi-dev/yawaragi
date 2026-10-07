import 'server-only'

import { env } from '@/env'
import type { CellarStore } from '@/lib/collection/cellar-store'
import { UpstashCellarStore } from '@/lib/collection/upstash-cellar-store'

/**
 * The production {@link CellarStore}, or `null` when the Upstash env pair is
 * absent — the exact mirror of `getJournalStore()`, sharing its database and
 * its degrade-to-unavailable posture.
 */
export function getCellarStore(): CellarStore | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new UpstashCellarStore(url, token)
}
