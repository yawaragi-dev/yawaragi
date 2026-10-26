import {
  type KeyedRecordStore,
  type RecordStoreSpec,
  byNumberThenId,
  recordStoreKey,
} from '@/lib/collection/record-store'
import { EXPRESSION_CODEC, type Expression } from '@/lib/schemas/expression'

/**
 * Persistence seam for a User's own Expressions — the bottlings they added
 * themselves (CONTEXT.md, ADR-0025). One of the four collection record kinds
 * stored the same way (`record-store.ts`), so the Postgres adapter of
 * ADR-0024 §5 is a third implementation here too.
 *
 * One Redis hash per user, field = the Expression's id, value = its JSON.
 * A store of its own rather than a field on the tastings that point at it: a
 * bottling exists before its first tasting ("Add your bottling"), is shared by
 * every tasting and cellar row of it, and is renamed in one place. `read`
 * returns them oldest first.
 */
export type ExpressionStore = KeyedRecordStore<Expression>

/** How own bottlings are stored: `expressions:user:<clerkUserId>`, oldest first. */
export const EXPRESSION_RECORDS: RecordStoreSpec<Expression> = {
  keyPrefix: 'expressions',
  codec: EXPRESSION_CODEC,
  rowKey: (expression) => expression.id,
  compare: byNumberThenId((expression) => expression.createdAt),
}

/** The Redis key for a user's Expressions. No TTL: they are permanent. */
export function expressionsKey(userId: string): string {
  return recordStoreKey(EXPRESSION_RECORDS, userId)
}
