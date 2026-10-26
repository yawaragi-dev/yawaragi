import {
  type KeyedRecordStore,
  type RecordStoreSpec,
  byNumberThenId,
  decodeRecordHash,
  recordStoreKey,
} from '@/lib/collection/record-store'
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
 * One of the four collection record kinds stored the same way
 * (`record-store.ts`): a Redis HASH per user (field = entry id, value = JSON),
 * with the Upstash adapter in `upstash-record-store.ts` and the in-memory
 * double in `in-memory-record-store.ts`. The eventual Postgres adapter
 * (ADR-0020) is a third implementation behind the same interface.
 *
 * Deliberate divergence from `TasteEventStore`: that store is an append-only,
 * TTL'd, size-capped Redis LIST (an ephemeral rolling window). A journal is
 * permanent, unbounded, and needs edit + per-entry delete: `put` upserts by id,
 * `remove` deletes one entry, `clear` erases the journal (the GDPR erasure path).
 * `read` returns entries oldest→newest by the embedded `event.occurredAt` (the
 * field `deriveTasteProfile` replays on — equal to `triedAt` by the creating
 * action's convention).
 */
export type JournalStore = KeyedRecordStore<JournalEntry>

/**
 * How a journal is stored. Keyed by the Clerk user id (ADR-0020) — NOT the
 * anonymous `yawaragi_session.sid` the TasteEventStore uses — with no TTL.
 * Ordered oldest→newest by the embedded event's `occurredAt`, `id` breaking ties.
 */
export const JOURNAL_RECORDS: RecordStoreSpec<JournalEntry> = {
  keyPrefix: 'journal',
  codec: JOURNAL_ENTRY_CODEC,
  rowKey: (entry) => entry.id,
  compare: byNumberThenId((entry) => entry.event.occurredAt),
}

/** The Redis key for a user's journal hash: `journal:user:<clerkUserId>`. */
export function journalKey(userId: string): string {
  return recordStoreKey(JOURNAL_RECORDS, userId)
}

/**
 * Decode bare stored values into current-version entries, oldest→newest. Each
 * goes through {@link JOURNAL_ENTRY_CODEC}: v1 entries (no `schemaVersion`) are
 * upcast, and a corrupt or newer-than-this-code record is dropped instead of
 * throwing, so one bad entry never takes the journal down with it.
 */
export function parseStoredEntries(raw: readonly string[]): JournalEntry[] {
  return decodeRecordHash(JOURNAL_RECORDS, raw.map((value, i) => [String(i), value] as const)).records
}
