import 'server-only'

import { UpstashHash } from '@/lib/collection/upstash-hash'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { type JournalStore, decodeJournalHash, journalKey } from '@/lib/taste/journal-store'

/**
 * Production {@link JournalStore} backed by Upstash Redis over its REST API.
 *
 * Same rationale as the TasteEventStore's Upstash adapter: talk to the REST
 * endpoint directly with `fetch` rather than add the `@upstash/redis` SDK (which
 * would mean weakening the pnpm `minimumReleaseAge` quarantine). The integration
 * seam is the `JournalStore` interface, so the eventual Postgres migration
 * (ADR-0020) is a new adapter, not a refactor.
 *
 * Storage shape: a Redis HASH per user (`journal:user:<clerkUserId>`), field =
 * entry id, value = a JSON-encoded JournalEntry. `put` is `HSET` (upsert by id,
 * so it doubles as edit); `remove` is `HDEL`; `read`/`dump` are `HGETALL`,
 * decoded and upcast by the shared helper (ADR-0024) and re-ordered
 * oldest→newest. `clear` is `DEL`. There is deliberately NO `EXPIRE` — a
 * journal is a permanent record (ADR-0020). The REST plumbing is
 * {@link UpstashHash}, shared with the cellar store.
 */
export class UpstashJournalStore implements JournalStore {
  private readonly hash: UpstashHash

  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    this.hash = new UpstashHash(restUrl, restToken, fetchImpl)
  }

  async read(userId: string): Promise<JournalEntry[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<JournalEntry>> {
    return decodeJournalHash(await this.hash.getAll(journalKey(userId)))
  }

  async put(userId: string, entry: JournalEntry): Promise<void> {
    await this.hash.set(journalKey(userId), entry.id, JSON.stringify(entry))
  }

  async remove(userId: string, entryId: string): Promise<void> {
    await this.hash.delete(journalKey(userId), entryId)
  }

  async clear(userId: string): Promise<void> {
    await this.hash.drop(journalKey(userId))
  }
}
