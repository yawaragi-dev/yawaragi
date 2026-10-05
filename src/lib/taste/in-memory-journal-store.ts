import type { StoreDump } from '@/lib/collection/versioned-record'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { type JournalStore, decodeJournalHash } from '@/lib/taste/journal-store'

/**
 * In-memory {@link JournalStore} for unit tests (and only tests). Mirrors the
 * Upstash adapter's semantics — a per-user map of entry-id → stored JSON (like
 * a Redis hash), `put` upserts by id, `read` returns entries ordered
 * oldest→newest, and there is no TTL or size cap (a journal is permanent).
 * Instantiate one per test for isolation. Not exported from any production
 * wiring path.
 *
 * Holds JSON strings, not objects, so a read goes through the same decode +
 * upcast as Upstash (ADR-0024) — and so {@link putRaw} can plant a legacy or
 * corrupt record the way one would really sit in Redis.
 */
export class InMemoryJournalStore implements JournalStore {
  private readonly hashes = new Map<string, Map<string, string>>()

  async read(userId: string): Promise<JournalEntry[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<JournalEntry>> {
    return decodeJournalHash([...(this.hashes.get(userId) ?? new Map<string, string>())])
  }

  async put(userId: string, entry: JournalEntry): Promise<void> {
    this.putRaw(userId, entry.id, JSON.stringify(entry))
  }

  async remove(userId: string, entryId: string): Promise<void> {
    this.hashes.get(userId)?.delete(entryId)
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
