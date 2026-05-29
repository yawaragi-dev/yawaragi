/**
 * Apply pending Supabase migrations to a Postgres connection.
 *
 * CLI usage: `pnpm migrate` (reads DATABASE_URL from env).
 * Programmatic usage: import { runMigrations } and pass a connection string —
 * used by tests/integration/setup.ts to migrate the testcontainer DB.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Pool } from 'pg'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase/migrations')

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

export async function runMigrations(connectionString: string): Promise<MigrationResult> {
  const pool = new Pool({ connectionString })
  const applied: string[] = []
  const skipped: string[] = []

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    const entries = await readdir(MIGRATIONS_DIR)
    const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort()

    for (const filename of sqlFiles) {
      const { rows } = await pool.query<{ filename: string }>(
        'SELECT filename FROM _migrations WHERE filename = $1',
        [filename],
      )
      if (rows.length > 0) {
        skipped.push(filename)
        continue
      }
      const sql = await readFile(join(MIGRATIONS_DIR, filename), 'utf8')
      await pool.query(sql)
      await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename])
      applied.push(filename)
    }
  } finally {
    await pool.end()
  }

  return { applied, skipped }
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local or your shell env.')
    return 1
  }
  try {
    const { applied, skipped } = await runMigrations(connectionString)
    for (const f of skipped) console.log(`✓ ${f} (already applied)`)
    for (const f of applied) console.log(`→ ${f} (applied)`)
    if (applied.length === 0) console.log(`No new migrations.`)
    return 0
  } catch (err) {
    console.error('Migration failed:', err)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
