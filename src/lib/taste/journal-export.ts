import type { StoreDump } from '@/lib/collection/versioned-record'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import {
  COLLECTION_EXPORT_FORMAT_VERSION,
  type CollectionExport,
} from '@/lib/schemas/journal-export'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * Build the export document for one user's collection — journal and cellar
 * (ADR-0020, ADR-0024 §3).
 *
 * Pure over injected arguments — no store, no clock, no filesystem — so the
 * shape is unit-testable, and the three callers (the `journal:export` CLI, the
 * daily backup route, and the eventual "download my data" in Account) share one
 * envelope instead of three.
 *
 * Takes the stores' DUMPS, not their reads, so records the running code cannot
 * decode still travel into the file under `rejected`.
 *
 * @param exportedAt epoch ms, injected rather than read from `Date.now()` so
 *        the output is deterministic in tests.
 */
export function buildCollectionExport(args: {
  userId: string
  journal: StoreDump<JournalEntry>
  cellar: StoreDump<CellarBottle>
  exportedAt: number
}): CollectionExport {
  return {
    formatVersion: COLLECTION_EXPORT_FORMAT_VERSION,
    exportedAt: new Date(args.exportedAt).toISOString(),
    userId: args.userId,
    // Fresh arrays so the caller's dump can't be mutated through the document;
    // the records themselves are shared verbatim — the round-trip fidelity the
    // export documents.
    journal: [...args.journal.records],
    cellar: [...args.cellar.records],
    rejected: [...args.journal.rejected, ...args.cellar.rejected],
  }
}
