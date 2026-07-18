import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { type JournalStore, parseStoredEntries } from '@/lib/taste/journal-store'

/**
 * In-memory {@link JournalStore} for unit tests (and only tests). Mirrors the
 * Upstash adapter's semantics — a per-user map of entry-id → entry (like a Redis
 * hash), `put` upserts by id, `read` returns entries ordered oldest→newest, and
 * there is no TTL or size cap (a journal is permanent). Instantiate one per test
 * for isolation. Not exported from any production wiring path.
 */
export class InMemoryJournalStore implements JournalStore {
  private readonly hashes = new Map<string, Map<string, JournalEntry>>()

  async read(userId: string): Promise<JournalEntry[]> {
    const hash = this.hashes.get(userId)
    if (!hash) return []
    // Round-trip through the shared parse/sort helper so ordering (and the
    // drop-bad-entries contract) is identical to the Upstash adapter's read.
    return parseStoredEntries([...hash.values()].map((entry) => JSON.stringify(entry)))
  }

  async put(userId: string, entry: JournalEntry): Promise<void> {
    let hash = this.hashes.get(userId)
    if (!hash) {
      hash = new Map<string, JournalEntry>()
      this.hashes.set(userId, hash)
    }
    hash.set(entry.id, entry)
  }

  async remove(userId: string, entryId: string): Promise<void> {
    this.hashes.get(userId)?.delete(entryId)
  }

  async clear(userId: string): Promise<void> {
    this.hashes.delete(userId)
  }
}
