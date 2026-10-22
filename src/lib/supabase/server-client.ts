import 'server-only'
import { Pool } from 'pg'
import { env } from '@/env'
import { createServerPool } from '@/lib/supabase/server-pool'

/**
 * Phase 2 deviates from the PRD's literal "supabase-js client" wording: this slice
 * uses a raw `pg.Pool` against the Supabase project's Postgres connection string.
 * Rationale lives in PR #47's body — bulk ingestion and RLS-in-CI testing are both
 * materially cleaner without the supabase-js → PostgREST hop. The folder name
 * `supabase/` reflects the target (the Supabase-managed Postgres project), not the
 * library. supabase-js stays in deps for future client-side use (Phase 2.5+).
 */

let cachedPool: Pool | undefined

export function getServerDbPool(): Pool {
  if (!env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Set the Supabase connection string (the project dashboard\'s Connect button → Transaction pooler) in .env.local and Vercel env vars.',
    )
  }
  if (!cachedPool) {
    // Sized for many serverless instances sharing one pooler — see server-pool.ts.
    cachedPool = createServerPool(env.DATABASE_URL)
  }
  return cachedPool
}

/**
 * Create an ad-hoc pool from an explicit connection string. Used by the migration
 * runner and by testcontainers integration tests where the connection target is
 * not the production DATABASE_URL.
 */
export function createDbPool(connectionString: string): Pool {
  return new Pool({ connectionString })
}
