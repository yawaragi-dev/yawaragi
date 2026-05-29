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
      // Wrap each migration in a single transaction so a mid-file failure
      // rolls back cleanly. Without this, a multi-statement SQL file that
      // throws on the 3rd statement would leave the first two committed
      // and the _migrations row never inserted, producing a half-applied
      // state that's painful to diagnose. The transaction makes apply
      // all-or-nothing per file.
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(sql)
        await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename])
        await client.query('COMMIT')
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {
          /* swallow rollback failure; surface the original */
        })
        throw err
      } finally {
        client.release()
      }
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
