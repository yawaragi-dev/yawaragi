import 'server-only'
import { env } from '@/env'
import { parseMaintainerAllowlist } from '@/lib/auth/maintainer-allowlist'
import { authorizeCronRequest } from '@/lib/cron/authorize'
import { BACKUP_BUCKET, type BackupStorage } from '@/lib/collection/backup-storage'
import type { CellarStore } from '@/lib/collection/cellar-store'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { type BackupUserResult, runCollectionBackup } from '@/lib/collection/run-collection-backup'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * `/api/cron/backup-collection` — the daily backup of every maintainer's
 * journal and cellar to a private Supabase Storage bucket (ADR-0024 §4).
 *
 * Same shape as `/api/cron/ingest`: Vercel Cron calls `GET`, manual runs use
 * `POST`, both the same handler; `Authorization: Bearer <CRON_SECRET>` checked
 * in constant time BEFORE any store or bucket is touched.
 *
 * Responses:
 * - 401 — auth failed (one generic body for every failure mode).
 * - 503 — not configured: no Upstash pair, or no Supabase URL + service-role
 *   key. Loud on purpose: a silently skipped backup is the failure this route
 *   exists to prevent, and a 503 shows up red in the Vercel cron log.
 * - 200 — every user backed up. 500 — at least one did not. The body lists
 *   each user's counts and path, never the records themselves.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export interface BackupRouteDeps {
  expectedSecret: string
  userIds: readonly string[]
  /** `null` when a store or the bucket is not configured. */
  build: () => { journal: JournalStore; cellar: CellarStore; storage: BackupStorage } | null
  now: () => number
}

const RESPONSE_HEADERS = { 'Cache-Control': 'no-store' } as const

export async function handleBackupRequest(
  request: Request,
  createDeps: () => BackupRouteDeps,
): Promise<Response> {
  const deps = createDeps()
  const auth = authorizeCronRequest(request.headers.get('authorization'), deps.expectedSecret)
  if (!auth.ok) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: RESPONSE_HEADERS })
  }

  const wired = deps.build()
  if (!wired) {
    return Response.json(
      { error: 'not_configured', status: 'skipped' },
      { status: 503, headers: RESPONSE_HEADERS },
    )
  }

  const results: BackupUserResult[] = await runCollectionBackup({
    userIds: deps.userIds,
    ...wired,
    now: deps.now(),
  })
  const ok = results.every((r) => r.ok)
  return Response.json(
    { status: ok ? 'success' : 'failed', users: results },
    { status: ok ? 200 : 500, headers: RESPONSE_HEADERS },
  )
}

export function createProductionDeps(): BackupRouteDeps {
  return {
    expectedSecret: env.CRON_SECRET,
    userIds: [...parseMaintainerAllowlist(env.MAINTAINER_USER_IDS)],
    build: () => {
      const journal = getJournalStore()
      const cellar = getCellarStore()
      const url = env.NEXT_PUBLIC_SUPABASE_URL
      const key = env.SUPABASE_SERVICE_ROLE_KEY
      if (!journal || !cellar || !url || !key) return null
      return { journal, cellar, storage: new SupabaseBackupStorage(url, key, BACKUP_BUCKET) }
    },
    now: () => Date.now(),
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleBackupRequest(request, createProductionDeps)
}

// Vercel Cron sends GET (see the 2026-06-02 note on the ingest route).
export const GET = POST
