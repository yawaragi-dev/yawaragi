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

async function queryRows<T extends QueryResultRow>(sql: string): Promise<T[]> {
  if (!process.env.DATABASE_URL) return []
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const { rows } = await client.query<T>(sql)
    return rows
  } finally {
    await client.end()
  }
}

// A CJK-only guard mirroring the app's `JAPANESE_SCRIPT_REGEX`. Used so
// the injected fixtures land on kanji brands (not the ~110 Latin-only
// brands, which route through a different lookup pass) and dodge the
// single-char hallucination guard. `~ '...{2,}$'` = two-or-more chars,
// all in the Hiragana/Katakana/CJK-Ideograph blocks.
const CJK_MULTI = `name_kanji ~ '^[ぁ-ゟ゠-ヿ一-鿿]{2,}$'`

// #109 PR B disambiguation fixture. Finds a brewery whose kanji, used as
// the extraction's `brewery_ja` with a garbage `name_ja`, drives the
// Sakenowa lookup to the AMBIGUOUS branch: 2+ brands under the brewery
// AND none of them shares the brewery's kanji (so the mono-brand
// same-name preference doesn't collapse it to matched_brewery_only).
// Returns the brewery kanji + the candidate brand ids the
// disambiguation list will render, so the spec can assert the tapped
// row navigates to one of them.
export async function findAmbiguousBreweryFixture(): Promise<
  { breweryJa: string; brandIds: number[] } | null
> {
  const brewery = await queryOne<{ brewery_id: number; name_kanji: string }>(`
    SELECT b.brewery_id, b.name_kanji
    FROM breweries b
    JOIN brands br ON br.brewery_id = b.brewery_id
    WHERE br.superseded_at IS NULL
      AND b.superseded_at IS NULL
      AND br.${CJK_MULTI}
      AND b.name_kanji ~ '^[ぁ-ゟ゠-ヿ一-鿿]{2,}$'
    GROUP BY b.brewery_id, b.name_kanji
    HAVING COUNT(*) >= 2
       AND COUNT(*) FILTER (WHERE br.name_kanji = b.name_kanji) = 0
       -- Every brand kanji under the brewery must be distinct, so the
       -- disambiguation list has no duplicate-kanji rows and the
       -- brewery kanji itself is unique across breweries (avoids a
       -- second brewery with the same kanji folding more candidates in).
       AND COUNT(DISTINCT br.name_kanji) = COUNT(*)
       AND (SELECT COUNT(*) FROM breweries b2 WHERE b2.name_kanji = b.name_kanji AND b2.superseded_at IS NULL) = 1
    ORDER BY b.brewery_id
    LIMIT 1
  `)
  if (!brewery) return null
  const rows = await queryRows<{ brand_id: number }>(`
    SELECT br.brand_id
    FROM brands br
    JOIN breweries b ON b.brewery_id = br.brewery_id
    WHERE b.name_kanji = '${brewery.name_kanji.replace(/'/g, "''")}'
      AND br.superseded_at IS NULL
      AND b.superseded_at IS NULL
    ORDER BY br.brand_id
    LIMIT 5
  `)
  return { breweryJa: brewery.name_kanji, brandIds: rows.map((r) => r.brand_id) }
}

// #109 PR B matched_brand_only fixture. A brand whose kanji is unique
// across the whole catalogue — used as `name_ja` with a garbage
// `brewery_ja` so the first pass misses (wrong brewery) and the
// brand-only fallback resolves to exactly one row → matched_brand_only
// with a brewery divergence. Returns the brand kanji + its id + its
// real brewery kanji (so the spec can assert the divergence shows the
// catalogue brewery, not the injected garbage).
export async function findUniqueBrandFixture(): Promise<
  { nameJa: string; brandId: number; breweryJa: string } | null
> {
  const row = await queryOne<{
    brand_id: number
    name_kanji: string
    brewery_kanji: string
  }>(`
    SELECT br.brand_id, br.name_kanji, b.name_kanji AS brewery_kanji
    FROM brands br
    JOIN breweries b ON b.brewery_id = br.brewery_id
    WHERE br.superseded_at IS NULL
      AND b.superseded_at IS NULL
      AND br.${CJK_MULTI}
      AND (
        SELECT COUNT(*) FROM brands x
        WHERE x.name_kanji = br.name_kanji AND x.superseded_at IS NULL
      ) = 1
    ORDER BY br.brand_id
    LIMIT 1
  `)
  if (!row) return null
  return {
    nameJa: row.name_kanji,
    brandId: row.brand_id,
    breweryJa: row.brewery_kanji,
  }
}

// #109 PR B matched_brewery_only fixture. A mono-brand brewery (exactly
// one brand line) whose kanji, used as `brewery_ja` with a garbage
// `name_ja`, drives the lookup to matched_brewery_only: first pass and
// brand-only miss, brewery-only finds the single brand and surfaces the
// brand divergence. Returns the brewery kanji + the resolved brand id.
export async function findMonoBrandBreweryFixture(): Promise<
  { breweryJa: string; brandId: number } | null
> {
  // NB: COUNT is over ALL brands under the brewery (no CJK filter on
  // the brand) — the brewery-only lookup the app runs counts every
  // brand, so a "mono-brand" brewery must have exactly one brand total.
  // Filtering brands by CJK here would let a 2-brand brewery (one kanji,
  // one single-char/kana) masquerade as mono-brand and the injected
  // scan would resolve to `ambiguous` instead. The brewery kanji itself
  // is still CJK-only + catalogue-unique so the injection resolves
  // cleanly.
  const row = await queryOne<{ brewery_id: number; name_kanji: string; brand_id: number }>(`
    SELECT b.brewery_id, b.name_kanji, MIN(br.brand_id) AS brand_id
    FROM breweries b
    JOIN brands br ON br.brewery_id = b.brewery_id
    WHERE br.superseded_at IS NULL
      AND b.superseded_at IS NULL
      AND b.name_kanji ~ '^[ぁ-ゟ゠-ヿ一-鿿]{2,}$'
    GROUP BY b.brewery_id, b.name_kanji
    HAVING COUNT(*) = 1
       -- Brewery kanji unique across breweries, so brewery-only can't
       -- fold in a second brewery's brands and turn ambiguous.
       AND (SELECT COUNT(*) FROM breweries b2 WHERE b2.name_kanji = b.name_kanji AND b2.superseded_at IS NULL) = 1
    ORDER BY b.brewery_id
    LIMIT 1
  `)
  if (!row) return null
  return { breweryJa: row.name_kanji, brandId: row.brand_id }
}
