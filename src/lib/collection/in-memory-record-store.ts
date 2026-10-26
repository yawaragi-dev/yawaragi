import {
  BOTTLE_HISTORY_RECORDS,
  type BottleHistoryStore,
  rewriteBottleHistory,
} from '@/lib/collection/bottle-history-store'
import { CELLAR_RECORDS, type CellarStore } from '@/lib/collection/cellar-store'
import { EXPRESSION_RECORDS, type ExpressionStore } from '@/lib/collection/expression-store'
import { type RecordStore, type RecordStoreSpec, decodeRecordHash } from '@/lib/collection/record-store'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { JOURNAL_RECORDS, type JournalStore } from '@/lib/taste/journal-store'

/**
 * In-memory {@link RecordStore} for unit tests (and only tests): a per-user
 * map of row key → stored JSON, like the Redis hash, so a read goes through the
 * same decode + upcast as Upstash and {@link putRaw} can plant a legacy or
 * corrupt record the way one would really sit in Redis. Instantiate one per
 * test for isolation. Not on any production wiring path.
 */
export class InMemoryRecordStore<T> implements RecordStore<T> {
  private readonly hashes = new Map<string, Map<string, string>>()
  /** Test seam: make writes fail, as an unreachable Upstash would. */
  failWrites = false

  constructor(private readonly spec: RecordStoreSpec<T>) {}

  async read(userId: string): Promise<T[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<T>> {
    return decodeRecordHash(this.spec, [...(this.hashes.get(userId) ?? new Map<string, string>())])
  }

  async size(userId: string): Promise<number> {
    return this.hashes.get(userId)?.size ?? 0
  }

  async put(userId: string, record: T): Promise<void> {
    await this.putMany(userId, [record])
  }

  async putMany(userId: string, records: readonly T[]): Promise<void> {
    this.assertWritable()
    for (const record of records) this.putRaw(userId, this.spec.rowKey(record), JSON.stringify(record))
  }

  async remove(userId: string, rowKey: string): Promise<void> {
    await this.removeMany(userId, [rowKey])
  }

  async removeMany(userId: string, rowKeys: readonly string[]): Promise<void> {
    this.assertWritable()
    for (const rowKey of rowKeys) this.hashes.get(userId)?.delete(rowKey)
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

  private assertWritable(): void {
    if (this.failWrites) throw new Error('store unreachable')
  }
}

export class InMemoryJournalStore extends InMemoryRecordStore<JournalEntry> implements JournalStore {
  constructor() {
    super(JOURNAL_RECORDS)
  }
}

export class InMemoryCellarStore extends InMemoryRecordStore<CellarBottle> implements CellarStore {
  constructor() {
    super(CELLAR_RECORDS)
  }
}

export class InMemoryExpressionStore extends InMemoryRecordStore<Expression> implements ExpressionStore {
  constructor() {
    super(EXPRESSION_RECORDS)
  }
}

export class InMemoryBottleHistoryStore
  extends InMemoryRecordStore<BottleEvent>
  implements BottleHistoryStore
{
  constructor() {
    super(BOTTLE_HISTORY_RECORDS)
  }

  async append(userId: string, events: readonly BottleEvent[]): Promise<void> {
    await this.putMany(userId, events)
  }

  async rewrite(userId: string, change: { put: readonly BottleEvent[]; drop: readonly string[] }): Promise<void> {
    await rewriteBottleHistory(this, userId, change)
  }
}
