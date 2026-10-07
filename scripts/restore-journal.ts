/**
 * Maintainer utility — restore a user's collection (journal + cellar) from an
 * export or a daily backup (ADR-0024 §4).
 *
 * Usage:
 *   pnpm journal:restore -- --file ./journal-export.json      # a local export
 *   pnpm journal:restore -- --backup latest                   # newest daily backup
 *   pnpm journal:restore -- --backup 2026-10-05T03-30-00Z.json
 *   … --from user_abc      # whose backups --backup reads; default is the
 *                          # sole MAINTAINER_USER_IDS entry
 *   … --user user_xyz      # write into another user id (e.g. after a Clerk
 *                          # instance move, #344); default is the file's own
 *   … --dry-run            # read and validate, write nothing
 *
 * Idempotent: records are upserted by key, nothing is deleted, so a restore
 * that stopped halfway is finished by running it again (see
 * `restoreCollection`). Refuses a file it cannot fully read rather than
 * restoring part of it.
 *
 * Reads `UPSTASH_REDIS_REST_*`, and for `--backup` also
 * `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, from `.env.local`.
 * Runs under `--conditions react-server` to import the real `server-only`
 * adapters, like `journal:export`. Prints counts only — never record contents.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMaintainerAllowlist } from '@/lib/auth/maintainer-allowlist'
import { BACKUP_BUCKET, backupPrefix } from '@/lib/collection/backup-storage'
import { restoreCollection } from '@/lib/collection/restore-collection'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'
import { UpstashCellarStore } from '@/lib/collection/upstash-cellar-store'
import { parseCollectionExport } from '@/lib/schemas/journal-export'
import { UpstashJournalStore } from '@/lib/taste/upstash-journal-store'

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}

async function loadSource(argv: readonly string[]): Promise<string> {
  const file = flag(argv, 'file')
  if (file) return readFile(resolve(file), 'utf8')

  const backup = flag(argv, 'backup')
  if (!backup) throw new Error('Pass --file <export.json> or --backup <latest|name>.')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('--backup needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')

  // Whose backups: --from, or the sole maintainer. Not --user: that is where
  // the restore writes, and the two differ after a Clerk instance move.
  const owner = flag(argv, 'from') ?? [...parseMaintainerAllowlist(process.env.MAINTAINER_USER_IDS)][0]
  if (!owner) throw new Error('--backup needs --from <clerkUserId> (no single maintainer configured).')
  const storage = new SupabaseBackupStorage(url, key, BACKUP_BUCKET)
  const prefix = backupPrefix(owner)
  const names = (await storage.list(prefix)).filter((n) => n.endsWith('.json')).sort()
  const name = backup === 'latest' ? names.at(-1) : backup
  if (!name || !names.includes(name)) {
    throw new Error(`No backup "${backup}" for ${owner}. ${names.length} available.`)
  }
  console.log(`Reading backup ${prefix}/${name}`)
  return storage.download(`${prefix}/${name}`)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const parsed = parseCollectionExport(JSON.parse(await loadSource(argv)))
  if (!parsed.ok) {
    console.error(`Refusing to restore: ${parsed.reason} (${parsed.detail})`)
    return 1
  }
  const { doc } = parsed
  const userId = flag(argv, 'user') ?? doc.userId

  console.log(
    `File: ${doc.journal.length} journal entries, ${doc.cellar.length} cellar rows, ` +
      `${doc.rejected.length} unreadable record(s), exported ${doc.exportedAt} for ${doc.userId}`,
  )
  if (argv.includes('--dry-run')) {
    console.log('Dry run — nothing written.')
    return 0
  }

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in .env.local.')
    return 1
  }
  const counts = await restoreCollection({
    doc,
    userId,
    journal: new UpstashJournalStore(url, token),
    cellar: new UpstashCellarStore(url, token),
  })
  console.log(`Restored ${counts.journal} journal entries and ${counts.cellar} cellar rows into ${userId}.`)
  if (counts.skippedRejected > 0) {
    console.warn(`  ! ${counts.skippedRejected} unreadable record(s) left in the file, not restored.`)
  }
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('restore-journal.ts')) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[journal:restore] failed:', err instanceof Error ? err.message : err)
      process.exit(2)
    })
}
