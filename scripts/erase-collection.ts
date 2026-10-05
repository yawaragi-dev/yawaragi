/**
 * Maintainer utility — the GDPR erasure path for one user's collection
 * (ADR-0009, ADR-0024): their journal, their cellar, AND their daily backups.
 *
 * Usage:
 *   pnpm journal:erase -- --user user_abc          # say what would be erased
 *   pnpm journal:erase -- --user user_abc --yes    # erase it
 *
 * Separate from the in-app "clear", which deliberately keeps the backups so an
 * accidental clear can be undone for 30 days. An erasure request is the one
 * case where the backups go too. Take an export first if the person asked for
 * a copy (Art. 20 before Art. 17).
 *
 * `--user` is required, never defaulted: erasing the wrong person's data is not
 * a mistake worth making convenient.
 */
import { BACKUP_BUCKET, backupPrefix } from '@/lib/collection/backup-storage'
import { cellarKey } from '@/lib/collection/cellar-store'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'
import { UpstashCellarStore } from '@/lib/collection/upstash-cellar-store'
import { journalKey } from '@/lib/taste/journal-store'
import { UpstashJournalStore } from '@/lib/taste/upstash-journal-store'

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const userId = flag(argv, 'user')?.trim()
  if (!userId) {
    console.error('Pass --user <clerkUserId>. It is never defaulted.')
    return 1
  }
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !token || !sbUrl || !sbKey) {
    console.error('Needs UPSTASH_REDIS_REST_URL/TOKEN, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    return 1
  }

  const journal = new UpstashJournalStore(url, token)
  const cellar = new UpstashCellarStore(url, token)
  const storage = new SupabaseBackupStorage(sbUrl, sbKey, BACKUP_BUCKET)
  const prefix = backupPrefix(userId)
  const [j, c, backups] = await Promise.all([journal.dump(userId), cellar.dump(userId), storage.list(prefix)])

  console.log(`${userId}:`)
  console.log(`  ${journalKey(userId)}: ${j.records.length + j.rejected.length} record(s)`)
  console.log(`  ${cellarKey(userId)}: ${c.records.length + c.rejected.length} record(s)`)
  console.log(`  ${BACKUP_BUCKET}/${prefix}/: ${backups.length} backup(s)`)

  if (!argv.includes('--yes')) {
    console.log('Nothing erased. Rerun with --yes to erase all of the above.')
    return 0
  }

  await Promise.all([journal.clear(userId), cellar.clear(userId)])
  await storage.remove(backups.map((name) => `${prefix}/${name}`))
  console.log('Erased.')
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('erase-collection.ts')) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[journal:erase] failed:', err instanceof Error ? err.message : err)
      process.exit(2)
    })
}
