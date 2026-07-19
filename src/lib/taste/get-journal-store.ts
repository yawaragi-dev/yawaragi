import 'server-only'

import { env } from '@/env'
import type { JournalStore } from '@/lib/taste/journal-store'
import { UpstashJournalStore } from '@/lib/taste/upstash-journal-store'

/**
 * Construct the production {@link JournalStore} from env, or `null` when the
 * Upstash env pair is absent — the exact mirror of {@link getTasteEventStore}.
 *
 * The journal shares Upstash with the taste-event store (same REST pair), but a
 * separate keyspace (`journal:user:*` vs `taste:*`) and a HASH rather than a
 * TTL'd LIST. `null` degrades journal persistence to a no-op in non-production
 * without Upstash — the same posture the anonymous taste path takes.
 */
export function getJournalStore(): JournalStore | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new UpstashJournalStore(url, token)
}
