/**
 * CLI entry for `pnpm ingest` — refreshes Sakenowa reference data into the
 * Supabase brands table via the ingestion pipeline. Exit code mirrors
 * pipeline success / failure: 0 on success, 1 on any error.
 *
 * Requires DATABASE_URL in env. Either set it in your shell, or invoke as
 * `tsx --env-file=.env.local scripts/ingest-sakenowa.ts`. The package.json
 * `ingest` script does the latter by default.
 */
import { Pool } from 'pg'
import { getBrands } from '../src/lib/sakenowa/client'
import { makePgBrandsDB } from '../src/lib/sakenowa/db'
import { ingestBrands } from '../src/lib/sakenowa/ingestion-pipeline'

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is not set. Add it to .env.local first.')
    return 1
  }

  const pool = new Pool({ connectionString })
  try {
    const startedAt = Date.now()
    const summary = await ingestBrands({
      client: { getBrands },
      db: makePgBrandsDB(pool),
    })
    const elapsedMs = Date.now() - startedAt
    console.log(
      `✓ ingested ${summary.total} brand(s) in ${elapsedMs}ms — ` +
        `added: ${summary.added}, updated: ${summary.updated}, unchanged: ${summary.unchanged}`,
    )
    return 0
  } catch (err) {
    console.error('✘ ingestion failed:', err instanceof Error ? err.message : err)
    if (err instanceof Error && err.stack) console.error(err.stack)
    return 1
  } finally {
    await pool.end()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => process.exit(code))
}
