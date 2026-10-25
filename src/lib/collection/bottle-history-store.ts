import { type StoreDump, decodeStoredFields } from '@/lib/collection/versioned-record'
import { BOTTLE_EVENT_CODEC, type BottleEvent } from '@/lib/schemas/bottle-event'

/**
 * Persistence seam for a User's bottle history (design question AB, ADR-0024
 * "Bottle history" amendment) — the same port + in-memory + Upstash pattern as
 * {@link CellarStore} and {@link ExpressionStore}, so the Postgres adapter of
 * ADR-0024 §5 is one more implementation.
 *
 * One Redis hash per user, field = the event's `id`, value = its JSON. A hash
 * rather than a list: an append is an `HSET` of a new id, so a restore that
 * writes the same events again changes nothing (ADR-0024 §4), and a seeded
 * event written twice by two racing actions is still one event. Order comes
 * from each event's `at`.
 *
 * Append-only: there is no `remove`. Only {@link clear} — the GDPR erasure —
 * takes events away.
 *
 * Not `server-only`: holds the interface and pure helpers the in-memory double
 * reuses. The Upstash adapter carries the marker.
 */
export interface BottleHistoryStore {
  /** The user's events, oldest first. `[]` if none. */
  read(userId: string): Promise<BottleEvent[]>
  /** Readable events plus the raw ones that could not be decoded. */
  dump(userId: string): Promise<StoreDump<BottleEvent>>
  /** How many events are stored, readable or not — cheap, for "is it empty?". */
  size(userId: string): Promise<number>
  /** Write events under their ids. An id already there is overwritten with the same event. */
  append(userId: string, events: readonly BottleEvent[]): Promise<void>
  /** Erase the whole history (GDPR erasure). */
  clear(userId: string): Promise<void>
}

/** The Redis key for a user's bottle history. No TTL: kept until erased. */
export function bottleHistoryKey(userId: string): string {
  return `bottle-history:user:${userId}`
}

/**
 * Decode a user's stored hash through {@link BOTTLE_EVENT_CODEC}, oldest first
 * (`id` breaking ties) — a hash is unordered, so ordering happens here.
 */
export function decodeBottleHistoryHash(
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
): StoreDump<BottleEvent> {
  const dump = decodeStoredFields(fields, BOTTLE_EVENT_CODEC)
  dump.records.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return dump
}
