import { z } from 'zod'
import { JournalEntrySchema } from '@/lib/schemas/journal-entry'

// The on-disk shape of `pnpm journal:export` (P5.5-D, #244, ADR-0020).
//
// The document does double duty, and both jobs pull in the same direction:
//
// 1. GDPR Art. 20 PORTABILITY. A JournalEntry is account-linked personal data
//    (ADR-0009 RoPA), so the data subject must be able to receive it in a
//    "structured, commonly used and machine-readable format" — JSON.
// 2. DURABILITY BACKSTOP. Upstash is the journal's system of record and the
//    free tier archives databases that go quiet, so an export is also the
//    restore source of last resort.
//
// Job 2 is why `entries` holds JournalEntry records VERBATIM — no flattening,
// no display enrichment, no re-timestamping. Anything that reshapes an entry
// makes the file a report rather than a restorable copy. `exportedAt` is the
// one concession to human readability (ISO 8601 rather than the entries' epoch
// ms), because it is document metadata rather than journal data.
//
// Verbatim is also already sufficient for BOTH jobs, because a JournalEntry
// carries its own denormalised `sake` name: the file names the sake a reader
// tried without a catalogue lookup, and a restore stays correct even if the
// Sakenowa brand later changes or disappears. No enrichment step is needed to
// make the export readable — which is exactly why none is allowed.
//
// Deliberately NOT included: the derived TasteMap. It is a fold over the
// entries' embedded TasteEvents and is never stored (see `journal-store.ts`);
// writing it into the export would create a second, immediately-staleable
// source of truth for a value the entries already determine.

export const JournalExportSchema = z.object({
  /** Bumped only on a breaking change to this envelope, so a future importer
   *  can refuse a file it does not understand instead of silently mis-reading
   *  it. Entry-level shape changes are the `JournalEntry` schema's business. */
  formatVersion: z.literal(1),
  /** ISO 8601 instant the export was taken. */
  exportedAt: z.string().datetime(),
  /** The Clerk user id the journal belongs to — the data subject. */
  userId: z.string().min(1),
  /** The journal, oldest→newest (the `JournalStore.read` contract), verbatim. */
  entries: z.array(JournalEntrySchema),
})

export type JournalExport = z.infer<typeof JournalExportSchema>

export const JOURNAL_EXPORT_FORMAT_VERSION = 1 as const
