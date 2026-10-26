import { type KeyedRecordStore, type RecordStoreSpec, recordStoreKey } from '@/lib/collection/record-store'
import { CELLAR_BOTTLE_CODEC, type CellarBottle, cellarRowKey } from '@/lib/schemas/cellar-bottle'

/**
 * Persistence seam for a User's Cellar (CONTEXT.md, ADR-0024) — one of the
 * four collection record kinds stored the same way (`record-store.ts`), so the
 * eventual Postgres adapter (ADR-0024 §5) is a third implementation, not a
 * refactor.
 *
 * One Redis hash per user, field = `cellarRowKey(row)`, value = a
 * JSON-encoded CellarBottle. One row per thing a bottle was logged against —
 * a sake, or one bottling of it — with a count, not one row per bottle.
 * `read` returns rows in no particular order — the list sorts for display;
 * `remove` takes a `cellarRowKey`.
 */
export type CellarStore = KeyedRecordStore<CellarBottle>

/** How the cellar is stored: `cellar:user:<clerkUserId>`, no TTL, unordered. */
export const CELLAR_RECORDS: RecordStoreSpec<CellarBottle> = {
  keyPrefix: 'cellar',
  codec: CELLAR_BOTTLE_CODEC,
  rowKey: cellarRowKey,
}

/** The Redis key for a user's cellar hash. No TTL: the cellar is permanent. */
export function cellarKey(userId: string): string {
  return recordStoreKey(CELLAR_RECORDS, userId)
}
