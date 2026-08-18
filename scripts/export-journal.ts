/**
 * Maintainer utility — export one user's TastingJournal to a JSON file
 * (P5.5-D, #244, ADR-0020).
 *
 * Usage:
 *   pnpm journal:export                     # the sole configured maintainer
 *   pnpm journal:export -- --user user_abc  # a specific Clerk user id
 *   pnpm journal:export -- --out ./bak.json # a specific destination
 *
 * Two jobs, one file (see `src/lib/schemas/journal-export.ts`):
 *   - GDPR Art. 20 portability for account-linked journal data, and
 *   - the durability backstop for a journal whose system of record is an
 *     Upstash free-tier database that gets archived when it goes quiet.
 *
 * Reads `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (and optionally
 * `MAINTAINER_USER_IDS`) from `.env.local` via `tsx --env-file`.
 *
 * Runs under `--conditions react-server` so the real {@link UpstashJournalStore}
 * — which carries `import 'server-only'` — is importable here. Reusing the
 * adapter rather than re-issuing HGETALL by hand (the way
 * `clear-rate-limit.ts` does) keeps the storage shape defined in exactly one
 * place, which matters most for the restore path: a hand-rolled reader that
 * drifts from the adapter produces a file that cannot restore.
 *
 * The written file contains personal data. It is gitignored, never logged in
 * full, and should be deleted once the request that prompted it is satisfied.
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseMaintainerAllowlist } from '@/lib/auth/maintainer-allowlist'
import { buildJournalExport } from '@/lib/taste/journal-export'
import { UpstashJournalStore } from '@/lib/taste/upstash-journal-store'

export type ResolvedUserId = { ok: true; userId: string } | { ok: false; reason: string }

/**
 * Decide whose journal to export.
 *
 * An explicit `--user` always wins and is deliberately NOT checked against the
 * allowlist: portability and erasure obligations outlive maintainer status, so
 * a user dropped from `MAINTAINER_USER_IDS` must still be exportable. Without a
 * flag we fall back to the allowlist only when it names exactly one person —
 * the v1 private-beta case — and refuse to guess otherwise.
 *
 * Pure over its arguments (the raw env string is passed in, not read) so the
 * selection rule is unit-testable without touching `process.env`.
 */
export function resolveExportUserId(
  requested: string | undefined,
  maintainerIdsRaw: string | undefined,
): ResolvedUserId {
  const trimmed = requested?.trim()
  if (trimmed) return { ok: true, userId: trimmed }

  const allowlist = [...parseMaintainerAllowlist(maintainerIdsRaw)]
  if (allowlist.length === 1) return { ok: true, userId: allowlist[0] }
  if (allowlist.length === 0) {
    return {
      ok: false,
      reason:
        'No user to export. Set MAINTAINER_USER_IDS in .env.local, or pass --user <clerkUserId>.',
    }
  }
  return {
    ok: false,
    reason: `MAINTAINER_USER_IDS names ${allowlist.length} maintainers (${allowlist.join(', ')}). Pass --user <clerkUserId> to pick one.`,
  }
}

/**
 * Default destination filename. Carries the full instant (not just the date)
 * so two exports on the same day don't silently overwrite each other — for a
 * restore-source file, an accidental overwrite is data loss.
 *
 * The user id is sanitised because it can come from `--user` on the command
 * line and is interpolated into a path; a stray `/` or `..` would otherwise
 * write outside the working directory.
 */
export function defaultExportFilename(userId: string, exportedAt: number): string {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '_')
  // 2026-08-17T09-00-00Z — ISO 8601 with the colons and millis removed, since
  // colons are illegal in filenames on Windows.
  const stamp = new Date(exportedAt).toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')
  return `journal-export-${safeUserId}-${stamp}.json`
}

/** Read `--flag value` out of argv. Returns undefined when absent. */
function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  if (i === -1) return undefined
  return argv[i + 1]
}

async function main(): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. ' +
        'Add both to .env.local (Upstash dashboard → REST API tab) and rerun.',
    )
    return 1
  }

  const argv = process.argv.slice(2)
  const resolved = resolveExportUserId(flag(argv, 'user'), process.env.MAINTAINER_USER_IDS)
  if (!resolved.ok) {
    console.error(resolved.reason)
    return 1
  }
  const { userId } = resolved

  const exportedAt = Date.now()
  const store = new UpstashJournalStore(url, token)
  const entries = await store.read(userId)
  const doc = buildJournalExport({ userId, entries, exportedAt })

  const outPath = resolve(flag(argv, 'out') ?? defaultExportFilename(userId, exportedAt))
  await writeFile(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')

  // Deliberately reports only the count and destination — the entries are
  // personal data and must not be echoed into a terminal or CI log.
  console.log(`Exported ${entries.length} journal entr${entries.length === 1 ? 'y' : 'ies'} for ${userId}`)
  console.log(`  → ${outPath}`)
  if (entries.length === 0) {
    console.log('  (empty journal — a valid export, nothing was stored for this user)')
  }
  return 0
}

// Only run the CLI when invoked directly, so the pure helpers above can be
// imported into a unit test without opening a network connection or exiting.
if (process.argv[1] && process.argv[1].endsWith('export-journal.ts')) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[journal:export] failed:', err instanceof Error ? err.message : err)
      process.exit(2)
    })
}
