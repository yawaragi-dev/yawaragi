import type { JournalEntry } from '@/lib/schemas/journal-entry'
import {
  JOURNAL_EXPORT_FORMAT_VERSION,
  type JournalExport,
} from '@/lib/schemas/journal-export'

/**
 * Build the export document for one user's TastingJournal (P5.5-D, #244).
 *
 * Pure over injected arguments — no store, no clock, no filesystem — so the
 * document shape is unit-testable and the CLI in `scripts/export-journal.ts`
 * stays a thin shell around it. That split also means the eventual
 * "download my data" route for the public launch (ADR-0020) reuses this
 * function rather than reimplementing the envelope.
 *
 * @param exportedAt epoch ms, injected rather than read from `Date.now()` so
 *        the output is deterministic in tests.
 */
export function buildJournalExport(args: {
  userId: string
  entries: readonly JournalEntry[]
  exportedAt: number
}): JournalExport {
  return {
    formatVersion: JOURNAL_EXPORT_FORMAT_VERSION,
    exportedAt: new Date(args.exportedAt).toISOString(),
    userId: args.userId,
    // Copied into a fresh array so the caller's slice can't be mutated through
    // the document, but the entries themselves are shared verbatim — the
    // round-trip fidelity the export schema documents.
    entries: [...args.entries],
  }
}
