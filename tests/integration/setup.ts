/**
 * Vitest global setup for integration tests.
 *
 * Spins up a single PostgreSQL container shared across the whole integration
 * run (`fileParallelism: false` in vitest.integration.config.ts), bootstraps
 * the Supabase roles the migrations expect (anon, authenticated, service_role),
 * applies migrations, and exposes the connection string via TEST_DATABASE_URL.
 *
 * Tests read process.env.TEST_DATABASE_URL and instantiate their own pg pools.
 * On teardown, the container is stopped.
 */
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { runMigrations } from '../../scripts/migrate'

const BOOTSTRAP_SQL = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  GRANT anon, authenticated, service_role TO CURRENT_USER;
`

let container: StartedPostgreSqlContainer | undefined

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  const connectionString = container.getConnectionUri()

  const bootstrap = new Pool({ connectionString })
  try {
    await bootstrap.query(BOOTSTRAP_SQL)
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
