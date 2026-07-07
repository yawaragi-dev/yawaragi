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

// UX-E (#166): the landing hero renders a fixed curated sample sake
// (SAMPLE_SCAN_BRAND_ID = 310, 木戸泉). The hero only shows when that
// brand AND its flavor_charts row are in the mirror; otherwise the landing
// degrades to its text intro. The spec skips its DB-bound assertions when
// this returns null so CI (no DATABASE_URL) and any data shift that drops
// the row stay green rather than failing.
export async function findLandingSampleBrandId(): Promise<number | null> {
  const row = await queryOne<{ brand_id: number }>(`
    SELECT b.brand_id
    FROM brands b
    JOIN flavor_charts fc ON fc.brand_id = b.brand_id
    WHERE b.brand_id = 310
    LIMIT 1
  `)
  return row?.brand_id ?? null
}

// The brand_id Phase 3 / S1's hardcoded extraction resolves to: a sake
// row whose `name_kanji = '獺祭'` joined to a brewery whose
// `name_kanji = '旭酒造'`. The scan flow always returns Dassai by Asahi
// Shuzo in S1 (the vision provider is stubbed), so the Playwright spec
// upload-to-landing-page assertion needs to know that brand's id at
// runtime. Returns null when Sakenowa hasn't published Dassai under the
// expected names (so the e2e spec skips rather than failing CI in a
// data-shape regression).
export async function findScanS1FixtureBrandId(): Promise<number | null> {
  const row = await queryOne<{ brand_id: number }>(`
    SELECT br.brand_id
    FROM brands br
    JOIN breweries b ON b.brewery_id = br.brewery_id
    WHERE br.name_kanji = '獺祭' AND b.name_kanji = '旭酒造'
    ORDER BY br.brand_id
    LIMIT 1
  `)
  return row?.brand_id ?? null
}
