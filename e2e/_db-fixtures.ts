// Live-DB lookups for E2E tests. Replaces magic `E2E_SEED_BRAND_ID`
// numbers with deterministic queries that pick whatever brand currently
// satisfies the test's data requirements — resilient to Sakenowa data
// shifts (placeholders, missing flavor_charts rows, etc.).
//
// Each helper opens a short-lived pg connection. Tests call them inside
// `test.beforeAll` so the cost is paid once per worker file, not per
// case. All helpers return `null` when `DATABASE_URL` is unset so CI
// (which intentionally skips DB-bound e2e) keeps its existing skip
// behaviour without touching the test code.
import { Client, type QueryResultRow } from 'pg'

async function queryOne<T extends QueryResultRow>(sql: string): Promise<T | null> {
  if (!process.env.DATABASE_URL) return null
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<T>(sql)
    return rows[0] ?? null
  } finally {
    await client.end()
  }
}

// First brand_id with a non-placeholder name. Sakenowa publishes ~48
// empty-name placeholder rows; we skip those because rendering the
// brand page assumes a non-empty kanji.
export async function findAnyBrandId(): Promise<number | null> {
  const row = await queryOne<{ brand_id: number }>(`
    SELECT brand_id
    FROM brands
    WHERE name IS NOT NULL AND name <> ''
    ORDER BY brand_id
    LIMIT 1
  `)
  return row?.brand_id ?? null
}

// First brand_id that has a flavor_charts row AND a non-placeholder
// name. Sakenowa publishes ~1355 charts for ~3167 brands so this is
// a strict subset; pinning the lowest qualifying id keeps the choice
// stable across runs without committing the value to source.
export async function findBrandWithFlavorChartId(): Promise<number | null> {
  const row = await queryOne<{ brand_id: number }>(`
    SELECT b.brand_id
    FROM brands b
    JOIN flavor_charts fc ON fc.brand_id = b.brand_id
    WHERE b.name IS NOT NULL AND b.name <> ''
    ORDER BY b.brand_id
    LIMIT 1
  `)
  return row?.brand_id ?? null
}
