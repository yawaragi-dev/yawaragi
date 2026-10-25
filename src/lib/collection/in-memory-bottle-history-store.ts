import { type BottleHistoryStore, decodeBottleHistoryHash } from '@/lib/collection/bottle-history-store'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { BottleEvent } from '@/lib/schemas/bottle-event'

/**
 * In-memory {@link BottleHistoryStore} for unit tests (and only tests). Holds
 * JSON strings per id, like the Redis hash, so reads go through the same
 * decode as Upstash, and {@link putRaw} can plant a record the code cannot read.
 */
export class InMemoryBottleHistoryStore implements BottleHistoryStore {
  private readonly hashes = new Map<string, Map<string, string>>()
  /** Test seam: make writes fail, as an unreachable Upstash would. */
  failWrites = false

  async read(userId: string): Promise<BottleEvent[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<BottleEvent>> {
    return decodeBottleHistoryHash([...(this.hashes.get(userId) ?? new Map<string, string>())])
  }

  async size(userId: string): Promise<number> {
    return this.hashes.get(userId)?.size ?? 0
  }

  async append(userId: string, events: readonly BottleEvent[]): Promise<void> {
    if (this.failWrites) throw new Error('history unreachable')
    for (const event of events) this.putRaw(userId, event.id, JSON.stringify(event))
  }

  async rewrite(userId: string, change: { put: readonly BottleEvent[]; drop: readonly string[] }): Promise<void> {
    if (this.failWrites) throw new Error('history unreachable')
    await this.append(userId, change.put)
    for (const id of change.drop) this.hashes.get(userId)?.delete(id)
  }

  async clear(userId: string): Promise<void> {
    this.hashes.delete(userId)
  }

  /** Test seam: store a value verbatim, bypassing the schema. */
  putRaw(userId: string, field: string, raw: string): void {
    let hash = this.hashes.get(userId)
    if (!hash) {
      hash = new Map<string, string>()
      this.hashes.set(userId, hash)
    }
    hash.set(field, raw)
  }
}
