import { backupPrefix, type BackupStorage } from '@/lib/collection/backup-storage'
import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import type { CellarStore } from '@/lib/collection/cellar-store'
import type { ExpressionStore } from '@/lib/collection/expression-store'
import type { JournalStore } from '@/lib/taste/journal-store'

export interface ErasedCounts {
  journal: number
  cellar: number
  expressions: number
  bottleHistory: number
  backups: number
}

/**
 * The GDPR erasure of one user's collection (Art. 17; ADR-0009, ADR-0024,
 * ADR-0025): their journal, their cellar, the bottlings they added
 * themselves, their bottle history, **and** their daily backups — unlike the in-app "clear", which
 * keeps the backups so a mistake can be undone.
 *
 * Shared by `pnpm journal:erase` and Account → "Delete account". Counts are
 * taken from the dumps first, so unreadable records are counted and erased
 * too. The stores go before the backups: if the bucket fails, a retry still
 * finds the backups to delete and nothing live is left behind.
 */
export async function eraseCollection(args: {
  userId: string
  journal: JournalStore
  cellar: CellarStore
  expressions: ExpressionStore
  bottleHistory: BottleHistoryStore
  backups: BackupStorage
}): Promise<ErasedCounts> {
  const { userId, journal, cellar, expressions, bottleHistory, backups } = args
  const prefix = backupPrefix(userId)
  const [j, c, x, h, files] = await Promise.all([
    journal.dump(userId),
    cellar.dump(userId),
    expressions.dump(userId),
    bottleHistory.dump(userId),
    backups.list(prefix),
  ])
  await Promise.all([
    journal.clear(userId),
    cellar.clear(userId),
    expressions.clear(userId),
    bottleHistory.clear(userId),
  ])
  await backups.remove(files.map((name) => `${prefix}/${name}`))
  return {
    journal: j.records.length + j.rejected.length,
    cellar: c.records.length + c.rejected.length,
    expressions: x.records.length + x.rejected.length,
    bottleHistory: h.records.length + h.rejected.length,
    backups: files.length,
  }
}
