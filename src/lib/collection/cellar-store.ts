import { type StoreDump, decodeStoredFields } from '@/lib/collection/versioned-record'
import { CELLAR_BOTTLE_CODEC, type CellarBottle } from '@/lib/schemas/cellar-bottle'

/**
 * Persistence seam for a User's Cellar (CONTEXT.md, ADR-0024) — the same
 * port + in-memory + Upstash pattern as {@link JournalStore}, so the eventual
 * Postgres adapter (ADR-0024 §5) is a third implementation, not a refactor.
 *
 * One Redis hash per user, field = the Sakenowa brand id, value = a
 * JSON-encoded CellarBottle. Keyed by brand because the Cellar holds one row
 * per sake with a count, not one row per bottle.
 *
 * Not `server-only`: holds the interface and pure helpers the in-memory double
 * reuses. The Upstash adapter carries the marker.
 */
export interface CellarStore {
  /** The user's rows, in no particular order — the list sorts for display. */
  read(userId: string): Promise<CellarBottle[]>
  /** Readable rows plus the raw records that could not be decoded. */
  dump(userId: string): Promise<StoreDump<CellarBottle>>
  /** Upsert the row for `bottle.brandId`. */
  put(userId: string, bottle: CellarBottle): Promise<void>
  /** Delete the row for one sake. No-op if absent. */
  remove(userId: string, brandId: number): Promise<void>
  /** Erase the whole cellar (GDPR erasure). */
  clear(userId: string): Promise<void>
}

/** The Redis key for a user's cellar hash. No TTL: the cellar is permanent. */
export function cellarKey(userId: string): string {
  return `cellar:user:${userId}`
}

/** Decode a user's stored cellar hash through {@link CELLAR_BOTTLE_CODEC}. */
export function decodeCellarHash(
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
): StoreDump<CellarBottle> {
  return decodeStoredFields(fields, CELLAR_BOTTLE_CODEC)
}
