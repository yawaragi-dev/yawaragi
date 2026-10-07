import type { CellarStore } from '@/lib/collection/cellar-store'
import type { CollectionExport } from '@/lib/schemas/journal-export'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * Write an export back into the stores (ADR-0024 §4) — `pnpm journal:restore`,
 * and, unchanged, the Postgres backfill of ADR-0024 §5 (point it at the
 * Postgres stores instead).
 *
 * Upserts every record by its key, so it is idempotent: a restore that died
 * halfway is finished by running it again, and restoring the same file twice
 * changes nothing. It does NOT delete records missing from the file — a
 * restore adds back what was lost; it is not a "make the store equal this
 * file" sync, which would turn an old backup into a data-loss tool.
 *
 * `rejected` records are not written back: they are raw values the code could
 * not read, and restoring them would only reproduce the problem. They stay in
 * the file for a human to look at; the count is returned so the CLI says so.
 *
 * The doc must already have been through `parseCollectionExport`, so every
 * record here is in its current version.
 */
export async function restoreCollection(args: {
  doc: CollectionExport
  /** Whose collection to write into. Usually `doc.userId`. */
  userId: string
  journal: JournalStore
  cellar: CellarStore
}): Promise<{ journal: number; cellar: number; skippedRejected: number }> {
  for (const entry of args.doc.journal) await args.journal.put(args.userId, entry)
  for (const bottle of args.doc.cellar) await args.cellar.put(args.userId, bottle)
  return {
    journal: args.doc.journal.length,
    cellar: args.doc.cellar.length,
    skippedRejected: args.doc.rejected.length,
  }
}
