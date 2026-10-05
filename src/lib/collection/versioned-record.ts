import type { z } from 'zod'

/**
 * Stored-record versioning (ADR-0024 §2).
 *
 * Every record the collection stores — a JournalEntry, a CellarBottle — carries
 * an integer `schemaVersion`. Writes always produce the current version; reads
 * go through {@link decodeVersionedRecord}, which runs the chain of upcasters
 * from the stored version up to the current one and only then validates. Call
 * sites never see an old shape, and nothing needs a migration job: an old
 * record moves forward the next time it is rewritten.
 *
 * A record with no `schemaVersion` is version 1. That is not a fallback for
 * sloppy writes — it is the definition of v1, because every JournalEntry
 * written before ADR-0024 had no version field.
 *
 * Pure and storage-agnostic on purpose: the Upstash adapters use it today, and
 * the Postgres adapters will run the same codecs over their `doc jsonb` column
 * (ADR-0024 §5), so a record reads the same on either side of the migration.
 */

/** One step forward: takes a version-n record, returns its version-(n+1) form. */
export type Upcaster = (record: Record<string, unknown>) => Record<string, unknown>

export interface VersionedRecordCodec<T> {
  /** What this record type is called in exports and logs (`journal`, `cellar`). */
  readonly kind: string
  /** The version every write produces. */
  readonly current: number
  /**
   * `upcasters[n]` turns a version-n record into version n+1. There must be one
   * for every n from 1 to `current - 1`; {@link assertCodecComplete} checks.
   */
  readonly upcasters: Readonly<Record<number, Upcaster>>
  /** The current shape. Validation runs after the upcasters, never before. */
  readonly schema: z.ZodType<T>
}

/**
 * Why a stored record could not be read.
 *
 * - `json`: not JSON at all (truncated write, tampering).
 * - `shape`: JSON, but not an object, or a `schemaVersion` that is not a
 *   positive integer.
 * - `newer`: written by a newer version of the code than this one — the
 *   rollback case. Kept apart from `invalid` because it is not corruption: the
 *   record is fine, this deployment just cannot read it yet.
 * - `invalid`: upcast cleanly but fails the current schema.
 */
export type DecodeFailure = 'json' | 'shape' | 'newer' | 'invalid'

export type DecodeResult<T> = { ok: true; value: T } | { ok: false; reason: DecodeFailure }

/** The stored version of a parsed record, or `null` if the field is malformed. */
export function storedVersion(record: Record<string, unknown>): number | null {
  if (!('schemaVersion' in record) || record.schemaVersion === undefined) return 1
  const v = record.schemaVersion
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : null
}

/**
 * Bring an already-parsed record up to the current version and validate it.
 * Exposed separately from {@link decodeVersionedRecord} for the export reader,
 * whose records arrive as JSON values inside the file rather than as strings.
 */
export function upcastRecord<T>(input: unknown, codec: VersionedRecordCodec<T>): DecodeResult<T> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, reason: 'shape' }
  }
  let record = input as Record<string, unknown>
  const version = storedVersion(record)
  if (version === null) return { ok: false, reason: 'shape' }
  if (version > codec.current) return { ok: false, reason: 'newer' }

  for (let v = version; v < codec.current; v++) {
    const step = codec.upcasters[v]
    // A missing step is a programming error, not bad data — but throwing here
    // would turn one deploy mistake into an unreadable journal. Report it as
    // invalid; `assertCodecComplete` is what catches it in the unit tests.
    if (!step) return { ok: false, reason: 'invalid' }
    record = step(record)
  }

  const parsed = codec.schema.safeParse(record)
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: 'invalid' }
}

/** Parse one stored JSON string into the current shape, or say why it can't be. */
export function decodeVersionedRecord<T>(
  raw: string,
  codec: VersionedRecordCodec<T>,
): DecodeResult<T> {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'json' }
  }
  return upcastRecord(json, codec)
}

/**
 * Throws if a codec is missing a step between 1 and `current`. Called from each
 * codec's unit test, so a version bump without its upcaster fails CI rather
 * than quietly reporting every old record as `invalid`.
 */
export function assertCodecComplete(codec: VersionedRecordCodec<unknown>): void {
  for (let v = 1; v < codec.current; v++) {
    if (typeof codec.upcasters[v] !== 'function') {
      throw new Error(`${codec.kind} codec has no upcaster from v${v} to v${v + 1}`)
    }
  }
}

/**
 * A record the store holds but this code cannot read. Kept, not deleted: it is
 * carried raw into exports and backups (ADR-0024 §2), so a rollback or a bug
 * never costs data that is still sitting in the store.
 */
export interface RejectedRecord {
  /** Which store it came from — the codec's `kind`. */
  store: string
  /** The hash field it was stored under (entry id, or brand id for the cellar). */
  id: string
  /** The stored value, byte for byte. */
  raw: string
  reason: DecodeFailure
}

/** Everything a store holds for one user: what decoded, and what did not. */
export interface StoreDump<T> {
  records: T[]
  rejected: RejectedRecord[]
}

/** Decode a set of `[field, value]` pairs, splitting readable from rejected. */
export function decodeStoredFields<T>(
  fields: ReadonlyArray<readonly [id: string, raw: string]>,
  codec: VersionedRecordCodec<T>,
): StoreDump<T> {
  const records: T[] = []
  const rejected: RejectedRecord[] = []
  for (const [id, raw] of fields) {
    const result = decodeVersionedRecord(raw, codec)
    if (result.ok) records.push(result.value)
    else rejected.push({ store: codec.kind, id, raw, reason: result.reason })
  }
  return { records, rejected }
}
