import { type StoreDump, decodeStoredFields } from '@/lib/collection/versioned-record'
import { EXPRESSION_CODEC, type Expression } from '@/lib/schemas/expression'

/**
 * Persistence seam for a User's own Expressions — the bottlings they added
 * themselves (CONTEXT.md, ADR-0025). The same port + in-memory + Upstash
 * pattern as {@link CellarStore}, so the Postgres adapter of ADR-0024 §5 is a
 * third implementation here too.
 *
 * One Redis hash per user, field = the Expression's id, value = its JSON.
 * A store of its own rather than a field on the tastings that point at it: a
 * bottling exists before its first tasting ("Add your bottling"), is shared by
 * every tasting and cellar row of it, and is renamed in one place.
 *
 * Not `server-only`: holds the interface and pure helpers the in-memory double
 * reuses. The Upstash adapter carries the marker.
 */
export interface ExpressionStore {
  /** The user's Expressions, oldest first. `[]` if none. */
  read(userId: string): Promise<Expression[]>
  /** Readable records plus the raw ones that could not be decoded. */
  dump(userId: string): Promise<StoreDump<Expression>>
  /** Upsert one Expression by its `id`. */
  put(userId: string, expression: Expression): Promise<void>
  /** Delete one Expression. No-op if absent. */
  remove(userId: string, expressionId: string): Promise<void>
  /** Erase every Expression the user added (GDPR erasure). */
  clear(userId: string): Promise<void>
}

/** The Redis key for a user's Expressions. No TTL: they are permanent. */
export function expressionsKey(userId: string): string {
  return `expressions:user:${userId}`
}

/**
 * Decode a user's stored hash through {@link EXPRESSION_CODEC}, oldest first
 * (`id` breaking ties) — a hash is unordered, so ordering happens here.
 */
export function decodeExpressionsHash(
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
): StoreDump<Expression> {
  const dump = decodeStoredFields(fields, EXPRESSION_CODEC)
  dump.records.sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  return dump
}
