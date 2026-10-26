import {
  type RecordStore,
  type RecordStoreSpec,
  byNumberThenId,
  recordStoreKey,
} from '@/lib/collection/record-store'
import { BOTTLE_EVENT_CODEC, type BottleEvent } from '@/lib/schemas/bottle-event'

/**
 * Persistence seam for a User's bottle history (design question AB, ADR-0024
 * "Bottle history" amendment) — one of the four collection record kinds
 * stored the same way (`record-store.ts`), so the Postgres adapter of
 * ADR-0024 §5 is one more implementation.
 *
 * One Redis hash per user, field = the event's `id`, value = its JSON. A hash
 * rather than a list: an append is an `HSET` of a new id, so a restore that
 * writes the same events again changes nothing (ADR-0024 §4), and a seeded
 * event written twice by two racing actions is still one event. Order comes
 * from each event's `at`.
 *
 * Append-only, with two exceptions that both start with the User: `clear`
 * (the GDPR erasure) and {@link BottleHistoryStore.rewrite}, which takes one
 * bottle off "Bottles you've had" at their request (design v1.10, AB6) —
 * rectification and erasure of a single bottle. No code path rewrites history
 * on its own. `size` counts events, readable or not — cheap, for "is it empty?".
 */
export interface BottleHistoryStore
  extends Pick<RecordStore<BottleEvent>, 'read' | 'dump' | 'size' | 'clear'> {
  /** Write events under their ids. An id already there is overwritten with the same event. */
  append(userId: string, events: readonly BottleEvent[]): Promise<void>
  /**
   * Take one bottle out (`forgetHadBottle` in `bottles-had.ts`): store `put`
   * again under their ids, then delete `drop`.
   */
  rewrite(userId: string, change: { put: readonly BottleEvent[]; drop: readonly string[] }): Promise<void>
}

/** How the history is stored: `bottle-history:user:<clerkUserId>`, oldest first. */
export const BOTTLE_HISTORY_RECORDS: RecordStoreSpec<BottleEvent> = {
  keyPrefix: 'bottle-history',
  codec: BOTTLE_EVENT_CODEC,
  rowKey: (event) => event.id,
  compare: byNumberThenId((event) => event.at),
}

/** The Redis key for a user's bottle history. No TTL: kept until erased. */
export function bottleHistoryKey(userId: string): string {
  return recordStoreKey(BOTTLE_HISTORY_RECORDS, userId)
}

/**
 * {@link BottleHistoryStore.rewrite} over any record store. Smaller lines
 * first, deletions second: if the second write fails, the bottle is
 * half-forgotten (an end with no "Added"), never more than asked.
 */
export async function rewriteBottleHistory(
  store: Pick<RecordStore<BottleEvent>, 'putMany' | 'removeMany'>,
  userId: string,
  change: { put: readonly BottleEvent[]; drop: readonly string[] },
): Promise<void> {
  await store.putMany(userId, change.put)
  await store.removeMany(userId, change.drop)
}
