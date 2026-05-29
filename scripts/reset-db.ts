/**
 * Local dev convenience: wipe the public schema so the next `pnpm migrate`
 * starts from a blank slate. Useful for testing migration order, ingest
 * performance, or working around half-applied state.
 *
 * Read DATABASE_URL from env (the package.json script loads .env.local).
 * Refuses to run unless `--yes` is passed — destructive.
 */
import { Pool } from 'pg'

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    return 1
  }

  if (!process.argv.includes('--yes')) {
    console.error(
      'Refusing to run without --yes. This drops the public schema (every table, every row).',
    )
    console.error('  pnpm db:reset --yes')
    return 1
  }

  const masked = connectionString.replace(/:\/\/[^@]*@/, '://<credentials>@')
  console.log(`Resetting ${masked}…`)

  const pool = new Pool({ connectionString })
  try {
    // DROP SCHEMA public CASCADE handles tables, types (provenance_source),
    // sequences, indexes, FKs, and the _migrations bookkeeping table in
    // one shot. The recreated schema grants are the Postgres default;
    // `pnpm migrate` reapplies the Supabase-style grants per table.
    await pool.query(
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;',
    )
    console.log('✓ public schema dropped + recreated')
    console.log('Next: pnpm migrate && pnpm ingest')
    return 0
  } catch (err) {
    console.error('✘ reset failed:', err instanceof Error ? err.message : err)
    return 1
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
