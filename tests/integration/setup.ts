/**
 * Vitest global setup for integration tests.
 *
 * Spins up a single PostgreSQL container shared across the whole integration
 * run (`fileParallelism: false` in vitest.integration.config.ts), bootstraps
 * the Supabase roles + schema-level grants the migrations expect (anon,
 * authenticated, service_role), applies migrations, and exposes the
 * connection string via TEST_DATABASE_URL.
 *
 * The bootstrap SQL lives in `tests/integration/bootstrap.sql` so the delta
 * from "raw Postgres" → "Supabase-like" is reviewable as code rather than
 * buried in a TypeScript template literal. See that file for the rationale
 * on what we mirror vs. omit.
 *
 * Tests read process.env.TEST_DATABASE_URL and instantiate their own pg pools.
 * On teardown, the container is stopped.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { runMigrations } from '~/scripts/migrate'

const BOOTSTRAP_SQL_PATH = join(dirname(fileURLToPath(import.meta.url)), 'bootstrap.sql')

let container: StartedPostgreSqlContainer | undefined

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const connectionString = container.getConnectionUri()

  const bootstrapSql = await readFile(BOOTSTRAP_SQL_PATH, 'utf8')

  const bootstrap = new Pool({ connectionString })
  try {
    await bootstrap.query(bootstrapSql)
  } finally {
    await bootstrap.end()
  }

  await runMigrations(connectionString)

  process.env.TEST_DATABASE_URL = connectionString
}

export async function teardown(): Promise<void> {
  if (container) {
    await container.stop()
    container = undefined
  }
}
