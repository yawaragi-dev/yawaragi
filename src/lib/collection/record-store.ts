import {
  type StoreDump,
  type VersionedRecordCodec,
  decodeStoredFields,
} from '@/lib/collection/versioned-record'

/**
 * The one shape every collection record kind is stored in (ADR-0024): the
 * tasting journal, the cellar, own bottlings (ADR-0025) and the bottle history.
 *
 * One Redis hash per user and kind, key `<keyPrefix>:user:<clerkUserId>`,
 * field = the record's row key, value = `JSON.stringify(record)`. No TTL: these
 * are permanent records, erased only on request. Reads go through the kind's
 * versioned codec, so an old record is upcast and an unreadable one is set
 * aside in `rejected` instead of throwing (ADR-0024 §2).
 *
 * A kind is a {@link RecordStoreSpec}; the two adapters —
 * `InMemoryRecordStore` for tests and `UpstashRecordStore` for production —
 * take one and implement {@link RecordStore}. The Postgres adapter of
 * ADR-0024 §5 is a third implementation of the same interface. Every kind's
 * port (`JournalStore`, `CellarStore`, …) is a narrowing of it.
 *
 * Changing a spec's `keyPrefix` or `rowKey` moves users' data out of reach:
 * both are part of the stored format, pinned by each kind's storage test.
 *
 * Not `server-only`: the interface and pure helpers only.
 */
export interface RecordStoreSpec<T> {
  /** The Redis key's first segment (`journal`, `cellar`, …). Stored format. */
  readonly keyPrefix: string
  /** Decodes and upcasts each stored value; its `kind` names rejected records. */
  readonly codec: VersionedRecordCodec<T>
  /** The hash field a record is stored under. Stored format. */
  readonly rowKey: (record: T) => string
  /** How `read` orders records. Without it, the hash's own order. */
  readonly compare?: (a: T, b: T) => number
}

export interface RecordStore<T> {
  /** The user's readable records, ordered by the spec's `compare`. `[]` if none. */
  read(userId: string): Promise<T[]>
  /**
   * Everything stored for the user: the readable records (ordered as `read`
   * orders them) and the raw ones that could not be decoded. Exports and
   * backups use this, so an unreadable record still leaves the store.
   */
  dump(userId: string): Promise<StoreDump<T>>
  /** How many records are stored, readable or not. */
  size(userId: string): Promise<number>
  /** Upsert one record under its row key. */
  put(userId: string, record: T): Promise<void>
  /** Upsert several records in one write — all or none. */
  putMany(userId: string, records: readonly T[]): Promise<void>
  /** Delete one record by its row key. No-op if absent. */
  remove(userId: string, rowKey: string): Promise<void>
  /** Delete several records by row key in one write. */
  removeMany(userId: string, rowKeys: readonly string[]): Promise<void>
  /** Erase everything of this kind the user has (GDPR erasure). */
  clear(userId: string): Promise<void>
}

/** The upsert-by-key store the journal, the cellar and own bottlings expose. */
export type KeyedRecordStore<T> = Pick<RecordStore<T>, 'read' | 'dump' | 'put' | 'remove' | 'clear'>

/** The Redis key holding one user's records of this kind. */
export function recordStoreKey(spec: Pick<RecordStoreSpec<unknown>, 'keyPrefix'>, userId: string): string {
  return `${spec.keyPrefix}:user:${userId}`
}

/**
 * Decode stored `[row key, JSON]` pairs into current-version records plus the
 * ones that could not be read, ordered by the spec's `compare` — a hash is
 * unordered, so ordering happens here.
 */
export function decodeRecordHash<T>(
  spec: RecordStoreSpec<T>,
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
): StoreDump<T> {
  const dump = decodeStoredFields(fields, spec.codec)
  if (spec.compare) dump.records.sort(spec.compare)
  return dump
}

/** Ascending by a number, then by `id` — the order of the time-ordered kinds. */
export function byNumberThenId<T extends { id: string }>(
  at: (record: T) => number,
): (a: T, b: T) => number {
  return (a, b) => at(a) - at(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
