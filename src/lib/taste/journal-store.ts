import { type JournalEntry, JournalEntrySchema } from '@/lib/schemas/journal-entry'

/**
 * Persistence seam for a User's TastingJournal (CONTEXT.md, ADR-0020).
 *
 * The journal is the durable, ACCOUNT-linked superset of the anonymous
 * TasteEvent stream (ADR-0019, superseded): entries are keyed by the Clerk user
 * id, permanent (no TTL), and individually editable/deletable. The TasteMap is
 * DERIVED from the entries' embedded TasteEvents on read (`deriveTasteProfile`),
 * never stored as a snapshot.
 *
 * Same port+adapters pattern as {@link TasteEventStore} — a narrow interface
 * with a production Upstash adapter (`upstash-journal-store.ts`) and an
 * in-memory double (`in-memory-journal-store.ts`) for tests — so the actions and
 * derivation stay testable without a live Upstash, and the eventual Postgres
 * adapter (the public-launch migration slice, ADR-0020) is a THIRD
 * implementation behind this same interface, not a refactor.
 *
 * Deliberate divergence from `TasteEventStore`: that store is an append-only,
 * TTL'd, size-capped Redis LIST (an ephemeral rolling window). A journal is
 * permanent, unbounded, and needs edit + per-entry delete — so this store is a
 * Redis HASH (field = entry id, value = JSON), which the interface below
 * reflects (`put` upserts by id; `remove` deletes one entry).
 *
 * Not `server-only`: holds only the interface, the key helper, and pure
 * parse/sort helpers so the in-memory double reuses them at runtime. The Upstash
 * adapter is the one module that touches env + network and carries the marker.
 */
export interface JournalStore {
  /** All entries for a user, oldest→newest by the embedded `event.occurredAt`
   *  (the field `deriveTasteProfile` replays on — equal to `triedAt` by the
   *  creating action's convention). `[]` if none. */
  read(userId: string): Promise<JournalEntry[]>
  /** Upsert one entry by its `id` (create, or edit an existing entry). */
  put(userId: string, entry: JournalEntry): Promise<void>
  /** Delete one entry by id (granular erasure). No-op if absent. */
  remove(userId: string, entryId: string): Promise<void>
  /** Erase the user's entire journal (the GDPR erasure path — ADR-0020). */
  clear(userId: string): Promise<void>
}

/**
 * The Redis key for a user's journal hash. Keyed by the Clerk user id (ADR-0020)
 * — NOT the anonymous `yawaragi_session.sid` the TasteEventStore uses. There is
 * deliberately no TTL: a journal is a permanent record.
 */
export function journalKey(userId: string): string {
  return `journal:user:${userId}`
}

/**
 * Parse raw stored JSON strings back into JournalEntries, dropping any entry
 * that no longer parses or fails the schema (tampering, or a schema migration)
 * rather than throwing — one bad entry must not nuke the whole journal — then
 * order oldest→newest by the embedded event's `occurredAt` (the field
 * `deriveTasteProfile` replays on), with `id` as a stable tie-break. A hash is
 * unordered, so ordering happens here on read.
 */
export function parseStoredEntries(raw: readonly string[]): JournalEntry[] {
  const entries: JournalEntry[] = []
  for (const item of raw) {
    let json: unknown
    try {
      json = JSON.parse(item)
    } catch {
      continue
    }
    const parsed = JournalEntrySchema.safeParse(json)
    if (parsed.success) entries.push(parsed.data)
  }
  entries.sort(
    (a, b) => a.event.occurredAt - b.event.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return entries
}
