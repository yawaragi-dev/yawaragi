import 'server-only'

import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { type JournalStore, journalKey, parseStoredEntries } from '@/lib/taste/journal-store'

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
 * so it doubles as edit); `remove` is `HDEL`; `read` is `HGETALL` (which the
 * REST API returns as a flat [field, value, field, value, …] array) parsed and
 * re-ordered oldest→newest by the shared helper. `clear` is `DEL`. There is
 * deliberately NO `EXPIRE` — a journal is a permanent record (ADR-0020).
 */
export class UpstashJournalStore implements JournalStore {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async read(userId: string): Promise<JournalEntry[]> {
    const result = await this.exec(['HGETALL', journalKey(userId)])
    if (!Array.isArray(result)) return []
    // HGETALL returns [field0, value0, field1, value1, …]; the JSON payloads are
    // the values (odd indices). Field ids are redundant with the parsed entry.id.
    const values: string[] = []
    for (let i = 1; i < result.length; i += 2) {
      const value = result[i]
      if (typeof value === 'string') values.push(value)
    }
    return parseStoredEntries(values)
  }

  async put(userId: string, entry: JournalEntry): Promise<void> {
    await this.exec(['HSET', journalKey(userId), entry.id, JSON.stringify(entry)])
  }

  async remove(userId: string, entryId: string): Promise<void> {
    await this.exec(['HDEL', journalKey(userId), entryId])
  }

  async clear(userId: string): Promise<void> {
    await this.exec(['DEL', journalKey(userId)])
  }

  private async exec(command: ReadonlyArray<string>): Promise<unknown> {
    const response = await this.fetchImpl(this.restUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.restToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Upstash REST error ${response.status} for command ${command[0]}`)
    }
    const json: unknown = await response.json()
    if (typeof json === 'object' && json !== null && 'result' in json) {
      return (json as { result: unknown }).result
    }
    return null
  }
}
