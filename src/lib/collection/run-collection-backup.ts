import {
  type BackupStorage,
  backupFileName,
  backupPath,
  backupPrefix,
  backupsToPrune,
} from '@/lib/collection/backup-storage'
import type { CellarStore } from '@/lib/collection/cellar-store'
import type { JournalStore } from '@/lib/taste/journal-store'
import { buildCollectionExport } from '@/lib/taste/journal-export'

/**
 * The daily backup (ADR-0024 §4): for each user, dump the journal and the
 * cellar, write them as one export-v2 file, then prune that user's backups to
 * the newest {@link BACKUPS_KEPT}.
 *
 * Pure over injected stores, storage and clock, so the job's contract —
 * dump not read, one file per user per run, prune only after a successful
 * write — is unit-tested without Upstash or Supabase.
 *
 * Users are independent: one user's failure is recorded and the run moves on,
 * so a single bad key cannot stop everyone else's backup. Pruning runs only
 * after that user's upload succeeded, so a failing upload never deletes the
 * copies that are now the newest good ones.
 */
export interface BackupUserResult {
  userId: string
  ok: boolean
  /** Where the backup was written, when it was. */
  path?: string
  journal?: number
  cellar?: number
  /** Records exported raw because the running code could not read them. */
  rejected?: number
  /** Older backups deleted by retention. */
  pruned?: number
  /** The failure, for the response body and the log — never record contents. */
  error?: string
}

export async function runCollectionBackup(args: {
  userIds: readonly string[]
  journal: JournalStore
  cellar: CellarStore
  storage: BackupStorage
  now: number
}): Promise<BackupUserResult[]> {
  const results: BackupUserResult[] = []
  for (const userId of args.userIds) {
    try {
      const [journal, cellar] = await Promise.all([
        args.journal.dump(userId),
        args.cellar.dump(userId),
      ])
      const doc = buildCollectionExport({ userId, journal, cellar, exportedAt: args.now })
      const path = backupPath(userId, backupFileName(args.now))
      await args.storage.upload(path, `${JSON.stringify(doc, null, 2)}\n`)

      const prefix = backupPrefix(userId)
      const stale = backupsToPrune(await args.storage.list(prefix))
      await args.storage.remove(stale.map((name) => `${prefix}/${name}`))

      results.push({
        userId,
        ok: true,
        path,
        journal: doc.journal.length,
        cellar: doc.cellar.length,
        rejected: doc.rejected.length,
        pruned: stale.length,
      })
    } catch (err) {
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}
