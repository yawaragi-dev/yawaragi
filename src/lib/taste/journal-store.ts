import {
  type StoreDump,
  decodeStoredFields,
} from '@/lib/collection/versioned-record'
import { JOURNAL_ENTRY_CODEC, type JournalEntry } from '@/lib/schemas/journal-entry'

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
  /**
   * Everything stored for the user: the readable entries (ordered as `read`
   * orders them) AND the raw records that could not be decoded (ADR-0024 §2).
   * Exports and backups use this, so an unreadable record is carried along
   * rather than silently left out of the only copy that leaves the store.
   */
  dump(userId: string): Promise<StoreDump<JournalEntry>>
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
 * Decode a user's stored hash — `[entry id, JSON]` pairs — into current-version
 * entries plus the records that could not be read. Each value goes through
 * {@link JOURNAL_ENTRY_CODEC}: v1 entries (no `schemaVersion`) are upcast, a
 * corrupt or newer-than-this-code record is set aside in `rejected` instead of
 * throwing, so one bad entry never takes the journal down with it. Readable
 * entries come back oldest→newest by the embedded event's `occurredAt` (the
 * field `deriveTasteProfile` replays on), `id` breaking ties — a hash is
 * unordered, so ordering happens here.
 */
export function decodeJournalHash(
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
): StoreDump<JournalEntry> {
  const dump = decodeStoredFields(fields, JOURNAL_ENTRY_CODEC)
  dump.records.sort(
    (a, b) => a.event.occurredAt - b.event.occurredAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return dump
}

/** The readable half of {@link decodeJournalHash}, for callers with bare values. */
export function parseStoredEntries(raw: readonly string[]): JournalEntry[] {
  return decodeJournalHash(raw.map((value, i) => [String(i), value] as const)).records
}
