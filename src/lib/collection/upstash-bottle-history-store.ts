import 'server-only'

import {
  type BottleHistoryStore,
  bottleHistoryKey,
  decodeBottleHistoryHash,
} from '@/lib/collection/bottle-history-store'
import { UpstashHash } from '@/lib/collection/upstash-hash'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

/**
 * Production {@link BottleHistoryStore}: a Redis hash per user on Upstash
 * (`bottle-history:user:<clerkUserId>`, field = event id). Same REST plumbing
 * and the same no-`EXPIRE` rule as the journal and the cellar (ADR-0024).
 */
export class UpstashBottleHistoryStore implements BottleHistoryStore {
  private readonly hash: UpstashHash

  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    this.hash = new UpstashHash(restUrl, restToken, fetchImpl)
  }

  async read(userId: string): Promise<BottleEvent[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<BottleEvent>> {
    return decodeBottleHistoryHash(await this.hash.getAll(bottleHistoryKey(userId)))
  }

  async size(userId: string): Promise<number> {
    return this.hash.size(bottleHistoryKey(userId))
  }

  async append(userId: string, events: readonly BottleEvent[]): Promise<void> {
    if (events.length === 0) return
    await this.hash.setMany(
      bottleHistoryKey(userId),
      events.map((event) => [event.id, JSON.stringify(event)] as const),
    )
  }

  async clear(userId: string): Promise<void> {
    await this.hash.drop(bottleHistoryKey(userId))
  }
}
