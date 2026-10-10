import { z } from 'zod'
import { type RejectedRecord, upcastRecord } from '@/lib/collection/versioned-record'
import { CELLAR_BOTTLE_CODEC, type CellarBottle } from '@/lib/schemas/cellar-bottle'
import { EXPRESSION_CODEC, type Expression } from '@/lib/schemas/expression'
import { JOURNAL_ENTRY_CODEC, type JournalEntry } from '@/lib/schemas/journal-entry'

// The on-disk shape of `pnpm journal:export` and of the daily backup
// (ADR-0020, ADR-0024 §3).
//
// The document does double duty, and both jobs pull in the same direction:
//
// 1. GDPR Art. 20 PORTABILITY. Journal entries and cellar rows are
//    account-linked personal data (ADR-0009 RoPA), so the data subject must be
//    able to receive them in a "structured, commonly used and machine-readable
//    format" — JSON.
// 2. DURABILITY BACKSTOP. Upstash is the system of record, so an export is
//    also the restore source (`pnpm journal:restore`).
//
// Job 2 is why records are held VERBATIM — no flattening, no display
// enrichment, no re-timestamping. Anything that reshapes a record makes the
// file a report rather than a restorable copy. `exportedAt` is the one
// concession to human readability (ISO 8601), because it is document metadata.
//
// Deliberately NOT included: the derived Palate. It is a fold over the
// entries and is never stored; writing it here would create a second,
// immediately-staleable source of truth.
//
// TWO VERSION NUMBERS, two jobs (ADR-0024):
// - `formatVersion` versions this ENVELOPE. v1 was `{ entries }`; v2 is
//   `{ journal, cellar, rejected }`; v3 adds `expressions`, the bottlings a
//   User added themselves (ADR-0025).
// - Each record carries its own `schemaVersion`. A new journal field bumps
//   that, not this. The reader below therefore upcasts records one by one
//   rather than validating them against today's schema, so a file written
//   today still restores after the record shapes have moved on.

export const COLLECTION_EXPORT_FORMAT_VERSION = 3 as const

const RejectedRecordSchema = z.object({
  store: z.string(),
  id: z.string(),
  raw: z.string(),
  reason: z.enum(['json', 'shape', 'newer', 'invalid']),
})

/** What the writer produces: current-version records, typed. */
export interface CollectionExport {
  formatVersion: typeof COLLECTION_EXPORT_FORMAT_VERSION
  /** ISO 8601 instant the export was taken. */
  exportedAt: string
  /** The Clerk user id the collection belongs to — the data subject. */
  userId: string
  /** Journal entries, oldest→newest (the `JournalStore.read` order). */
  journal: JournalEntry[]
  /** Cellar rows, in store order. */
  cellar: CellarBottle[]
  /** The bottlings the User added themselves, oldest first (ADR-0025). */
  expressions: Expression[]
  /**
   * Records the store held but the exporting code could not read (ADR-0024
   * §2), byte for byte. Empty in the normal case; present so a backup taken
   * during a bad deploy still holds everything the store held.
   */
  rejected: RejectedRecord[]
}

const EnvelopeV1 = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string().datetime(),
  userId: z.string().min(1),
  entries: z.array(z.unknown()),
})

const EnvelopeV2 = z.object({
  formatVersion: z.literal(2),
  exportedAt: z.string().datetime(),
  userId: z.string().min(1),
  journal: z.array(z.unknown()),
  cellar: z.array(z.unknown()),
  rejected: z.array(RejectedRecordSchema),
})

const EnvelopeV3 = EnvelopeV2.extend({
  formatVersion: z.literal(3),
  expressions: z.array(z.unknown()),
})

export type ParsedCollectionExport =
  | { ok: true; doc: CollectionExport }
  | { ok: false; reason: 'unknown_format' | 'invalid_envelope' | 'invalid_record'; detail: string }

/**
 * Read an export file of any known format into the current shape. Refuses a
 * `formatVersion` it does not know instead of guessing, and refuses the whole
 * file if any record cannot be brought up to date — a restore that silently
 * skipped records would be worse than one that stops and says which.
 */
export function parseCollectionExport(input: unknown): ParsedCollectionExport {
  const version =
    typeof input === 'object' && input !== null && 'formatVersion' in input
      ? (input as { formatVersion: unknown }).formatVersion
      : undefined

  let envelope: {
    exportedAt: string
    userId: string
    journal: unknown[]
    cellar: unknown[]
    expressions: unknown[]
    rejected: RejectedRecord[]
  }
  if (version === 1) {
    const v1 = EnvelopeV1.safeParse(input)
    if (!v1.success) return { ok: false, reason: 'invalid_envelope', detail: v1.error.message }
    envelope = { ...v1.data, journal: v1.data.entries, cellar: [], expressions: [], rejected: [] }
  } else if (version === 2) {
    const v2 = EnvelopeV2.safeParse(input)
    if (!v2.success) return { ok: false, reason: 'invalid_envelope', detail: v2.error.message }
    envelope = { ...v2.data, expressions: [] }
  } else if (version === 3) {
    const v3 = EnvelopeV3.safeParse(input)
    if (!v3.success) return { ok: false, reason: 'invalid_envelope', detail: v3.error.message }
    envelope = v3.data
  } else {
    return { ok: false, reason: 'unknown_format', detail: `formatVersion ${String(version)}` }
  }

  const journal: JournalEntry[] = []
  for (const [i, record] of envelope.journal.entries()) {
    const result = upcastRecord(record, JOURNAL_ENTRY_CODEC)
    if (!result.ok) return { ok: false, reason: 'invalid_record', detail: `journal[${i}]: ${result.reason}` }
    journal.push(result.value)
  }
  const cellar: CellarBottle[] = []
  for (const [i, record] of envelope.cellar.entries()) {
    const result = upcastRecord(record, CELLAR_BOTTLE_CODEC)
    if (!result.ok) return { ok: false, reason: 'invalid_record', detail: `cellar[${i}]: ${result.reason}` }
    cellar.push(result.value)
  }
  const expressions: Expression[] = []
  for (const [i, record] of envelope.expressions.entries()) {
    const result = upcastRecord(record, EXPRESSION_CODEC)
    if (!result.ok) return { ok: false, reason: 'invalid_record', detail: `expressions[${i}]: ${result.reason}` }
    expressions.push(result.value)
  }

  return {
    ok: true,
    doc: {
      formatVersion: COLLECTION_EXPORT_FORMAT_VERSION,
      exportedAt: envelope.exportedAt,
      userId: envelope.userId,
      journal,
      cellar,
      expressions,
      rejected: envelope.rejected,
    },
  }
}
