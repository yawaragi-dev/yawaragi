'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { env } from '@/env'
import { BACKUP_BUCKET } from '@/lib/collection/backup-storage'
import { eraseCollection } from '@/lib/collection/erase-collection'
import { getBottleHistoryStore } from '@/lib/collection/get-bottle-history-store'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'
import { describeError, logFailure } from '@/lib/observability/log-failure'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { buildCollectionExport } from '@/lib/taste/journal-export'

/**
 * Account → "Export journal" and "Delete account" (design §15): the visitor's
 * own GDPR rights, reachable without writing to us (Art. 15, 17, 20; ADR-0009
 * "User rights are implementable, not promised").
 *
 * Open to every signed-in visitor, not only maintainers: anyone with an
 * account may take their data or end the account, even while the collection
 * itself is maintainer-only (ADR-0020) and theirs is empty.
 */

export type ExportResult =
  | { status: 'ok'; fileName: string; json: string }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

/** The visitor's collection in the export format `pnpm journal:restore` reads (v4). */
export async function exportMyCollection(): Promise<ExportResult> {
  const { userId } = await auth()
  if (!userId) return { status: 'forbidden' }
  const journal = getJournalStore()
  const cellar = getCellarStore()
  const expressions = getExpressionStore()
  const bottleHistory = getBottleHistoryStore()
  if (!journal || !cellar || !expressions || !bottleHistory) return { status: 'unavailable' }
  try {
    const exportedAt = Date.now()
    const [j, c, x, h] = await Promise.all([
      journal.dump(userId),
      cellar.dump(userId),
      expressions.dump(userId),
      bottleHistory.dump(userId),
    ])
    const doc = buildCollectionExport({
      userId,
      journal: j,
      cellar: c,
      expressions: x,
      bottleHistory: h,
      exportedAt,
    })
    return {
      status: 'ok',
      fileName: `yawaragi-journal-${new Date(exportedAt).toISOString().slice(0, 10)}.json`,
      json: `${JSON.stringify(doc, null, 2)}\n`,
    }
  } catch (error) {
    logFailure({ where: 'account export', ...describeError(error) })
    return { status: 'unavailable' }
  }
}

export type DeleteAccountResult = { status: 'ok' } | { status: 'forbidden' } | { status: 'unavailable' }

/**
 * Erases the visitor's collection and backups, then the Clerk account. The
 * account goes last: if the erasure fails the visitor is still signed in and
 * can try again, rather than left with data and no way to reach it.
 * `confirm` must be the literal the dialog sends, so nothing else can call
 * this by accident.
 */
export async function deleteMyAccount(confirm: 'delete-permanently'): Promise<DeleteAccountResult> {
  if (confirm !== 'delete-permanently') return { status: 'forbidden' }
  const { userId } = await auth()
  if (!userId) return { status: 'forbidden' }
  const journal = getJournalStore()
  const cellar = getCellarStore()
  const expressions = getExpressionStore()
  const bottleHistory = getBottleHistoryStore()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!journal || !cellar || !expressions || !bottleHistory || !url || !key) {
    return { status: 'unavailable' }
  }
  try {
    const backups = new SupabaseBackupStorage(url, key, BACKUP_BUCKET)
    await eraseCollection({ userId, journal, cellar, expressions, bottleHistory, backups })
    const clerk = await clerkClient()
    await clerk.users.deleteUser(userId)
    return { status: 'ok' }
  } catch (error) {
    logFailure({ where: 'account delete', ...describeError(error) })
    return { status: 'unavailable' }
  }
}
