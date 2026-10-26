import 'server-only'

import {
  BOTTLE_HISTORY_RECORDS,
  type BottleHistoryStore,
  rewriteBottleHistory,
} from '@/lib/collection/bottle-history-store'
import { CELLAR_RECORDS, type CellarStore } from '@/lib/collection/cellar-store'
import { EXPRESSION_RECORDS, type ExpressionStore } from '@/lib/collection/expression-store'
import {
  type RecordStore,
  type RecordStoreSpec,
  decodeRecordHash,
  recordStoreKey,
} from '@/lib/collection/record-store'
import { UpstashHash } from '@/lib/collection/upstash-hash'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { JOURNAL_RECORDS, type JournalStore } from '@/lib/taste/journal-store'

/**
 * Production {@link RecordStore} on Upstash Redis over its REST API (the
 * plumbing is {@link UpstashHash}). One hash per user and kind:
 * `put`/`putMany` are `HSET` (upsert by row key, so `put` doubles as edit),
 * `remove`/`removeMany` are `HDEL`, `read`/`dump` are `HGETALL` decoded and
 * upcast through the kind's codec (ADR-0024), `size` is `HLEN`, `clear` is
 * `DEL`. Deliberately no `EXPIRE`: these are permanent records (ADR-0020,
 * ADR-0024). A failed REST call throws.
 */
export class UpstashRecordStore<T> implements RecordStore<T> {
  private readonly hash: UpstashHash

  constructor(
    private readonly spec: RecordStoreSpec<T>,
    restUrl: string,
    restToken: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    this.hash = new UpstashHash(restUrl, restToken, fetchImpl)
  }

  async read(userId: string): Promise<T[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<T>> {
    return decodeRecordHash(this.spec, await this.hash.getAll(this.key(userId)))
  }

  async size(userId: string): Promise<number> {
    return this.hash.size(this.key(userId))
  }

  async put(userId: string, record: T): Promise<void> {
    await this.hash.set(this.key(userId), this.spec.rowKey(record), JSON.stringify(record))
  }

  async putMany(userId: string, records: readonly T[]): Promise<void> {
    await this.hash.setMany(
      this.key(userId),
      records.map((record) => [this.spec.rowKey(record), JSON.stringify(record)] as const),
    )
  }

  async remove(userId: string, rowKey: string): Promise<void> {
    await this.hash.delete(this.key(userId), rowKey)
  }

  async removeMany(userId: string, rowKeys: readonly string[]): Promise<void> {
    await this.hash.deleteMany(this.key(userId), rowKeys)
  }

  async clear(userId: string): Promise<void> {
    await this.hash.drop(this.key(userId))
  }

  private key(userId: string): string {
    return recordStoreKey(this.spec, userId)
  }
}

export class UpstashJournalStore extends UpstashRecordStore<JournalEntry> implements JournalStore {
  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    super(JOURNAL_RECORDS, restUrl, restToken, fetchImpl)
  }
}

export class UpstashCellarStore extends UpstashRecordStore<CellarBottle> implements CellarStore {
  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    super(CELLAR_RECORDS, restUrl, restToken, fetchImpl)
  }
}

export class UpstashExpressionStore extends UpstashRecordStore<Expression> implements ExpressionStore {
  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    super(EXPRESSION_RECORDS, restUrl, restToken, fetchImpl)
  }
}

export class UpstashBottleHistoryStore
  extends UpstashRecordStore<BottleEvent>
  implements BottleHistoryStore
{
  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    super(BOTTLE_HISTORY_RECORDS, restUrl, restToken, fetchImpl)
  }

  async append(userId: string, events: readonly BottleEvent[]): Promise<void> {
    await this.putMany(userId, events)
  }

  async rewrite(userId: string, change: { put: readonly BottleEvent[]; drop: readonly string[] }): Promise<void> {
    await rewriteBottleHistory(this, userId, change)
  }
}
