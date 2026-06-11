/**
 * Maintainer utility — compares Sakenowa's upstream brand / brewery
 * counts to our mirror, and probes a small canary set for presence.
 *
 * Usage:
 *   pnpm sakenowa:freshness
 *
 * Reads `DATABASE_URL` from `.env.local` (loaded via `tsx --env-file`).
 * Hits Sakenowa's public API for the source of truth — no auth, no
 * cost, ~50 KB JSON.
 *
 * Why this exists: 2026-06-11 testing surfaced a Takashimizu bottle
 * that failed every code-level fallback. We later confirmed Sakenowa
 * upstream HAS the brand `高清水` (Brand 81) and the brewery
 * `秋田酒類製造` (Brewery 56) but our mirror is missing them. Without
 * this script, the only way to detect the gap was a failed scan plus
 * a manual `curl + psql` triage round. This makes the gap surfaceable
 * in seconds without firing the vision model.
 *
 * Exits non-zero when either:
 *   - the canary set has any missing entries (an in-the-wild bottle
 *     would fail), OR
 *   - the upstream / mirror count delta exceeds 1 % of upstream.
 *
 * Non-zero exit is what makes this scriptable into a cron / health
 * check; the human-readable output stays useful in either case.
 *
 * Not part of `pnpm verify` — production-data-dependent and the
 * Sakenowa API is best-effort. Run it manually when a scan failure
 * smells like a data gap.
 */
import { Pool } from 'pg'

const SAKENOWA_BASE_URL = 'https://muro.sakenowa.com/sakenowa-data/api'

interface SakenowaBrand {
  id: number
  name: string
  breweryId: number
}

interface SakenowaBrewery {
  id: number
  name: string
  areaId: number
}

/**
 * Canary brands + breweries. If any of these go missing in the
 * mirror, a real bottle in someone's hand will fail to resolve. The
 * list is intentionally small and biased toward well-known bottles
 * a maintainer would actually pour at a tasting.
 *
 * Add entries here when a new in-the-wild bottle hits a mirror gap
 * — `docs/label-scan-recognition-obstacles.md` §17 has the running
 * narrative.
 */
const CANARY_BRANDS: ReadonlyArray<string> = [
  '獺祭', // Dassai (旭酒造)
  '八海山', // Hakkaisan
  '久保田', // Kubota
  '高清水', // Takashimizu — 2026-06-11 motivating gap
  '蔵王', // Zao — variant-kanji fixture (#117)
  '萬歳楽', // Manzairaku — single-char-hallucination fixture (#14)
  '楯野川', // Tatenokawa — 2026-06-12 sub-brand-mismatch fixture (§18).
  //           Bottle label says 七垂二十貫 (Nanatare Nijukkan), a SKU
  //           line within the 楯野川 family; Sakenowa stores only the
  //           main brand 楯野川. This canary checks the *main* brand
  //           is present — the sub-brand mismatch is a separate
  //           catalogue-coverage problem documented in §18.
]

const CANARY_BREWERIES: ReadonlyArray<string> = [
  '旭酒造',
  '八海醸造',
  '朝日酒造',
  '秋田酒類製造', // Takashimizu's brewery
  '小堀酒造店', // Manzairaku's brewery
  '楯の川酒造', // Tatenokawa's brewery — paired with the §18 fixture
]

async function fetchUpstream<T>(path: string): Promise<T> {
  const res = await fetch(`${SAKENOWA_BASE_URL}/${path}`)
  if (!res.ok) {
    throw new Error(`Sakenowa ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

interface MirrorSnapshot {
  brandCount: number
  breweryCount: number
  maxBrandId: number | null
  maxBreweryId: number | null
  presentBrandKanji: Set<string>
  presentBreweryKanji: Set<string>
}

async function readMirror(pool: Pool): Promise<MirrorSnapshot> {
  const { rows: brandRows } = await pool.query<{
    count: string
    max: string | null
  }>(`SELECT count(*)::text AS count, max(brand_id)::text AS max FROM brands`)
  const { rows: breweryRows } = await pool.query<{
    count: string
    max: string | null
  }>(`SELECT count(*)::text AS count, max(brewery_id)::text AS max FROM breweries`)
  const { rows: brandKanjiRows } = await pool.query<{ name_kanji: string }>(
    `SELECT name_kanji FROM brands WHERE name_kanji = ANY($1::text[])`,
    [[...CANARY_BRANDS]],
  )
  const { rows: breweryKanjiRows } = await pool.query<{ name_kanji: string }>(
    `SELECT name_kanji FROM breweries WHERE name_kanji = ANY($1::text[])`,
    [[...CANARY_BREWERIES]],
  )

  return {
    brandCount: Number(brandRows[0].count),
    breweryCount: Number(breweryRows[0].count),
    maxBrandId: brandRows[0].max === null ? null : Number(brandRows[0].max),
    maxBreweryId: breweryRows[0].max === null ? null : Number(breweryRows[0].max),
    presentBrandKanji: new Set(brandKanjiRows.map((r) => r.name_kanji)),
    presentBreweryKanji: new Set(breweryKanjiRows.map((r) => r.name_kanji)),
  }
}

function pctDelta(mirror: number, upstream: number): string {
  if (upstream === 0) return 'n/a'
  const delta = ((upstream - mirror) / upstream) * 100
  return `${delta >= 0 ? '-' : '+'}${Math.abs(delta).toFixed(2)} %`
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Missing DATABASE_URL. Add it to .env.local and rerun.')
    return 1
  }

  console.log('[freshness] fetching Sakenowa upstream …')
  const upstreamBrands = await fetchUpstream<{ brands: SakenowaBrand[] }>('brands')
  const upstreamBreweries = await fetchUpstream<{ breweries: SakenowaBrewery[] }>('breweries')

  const upstreamBrandIds = upstreamBrands.brands.map((b) => b.id)
  const upstreamBreweryIds = upstreamBreweries.breweries.map((b) => b.id)
  const maxUpstreamBrandId = upstreamBrandIds.length === 0 ? 0 : Math.max(...upstreamBrandIds)
  const maxUpstreamBreweryId =
    upstreamBreweryIds.length === 0 ? 0 : Math.max(...upstreamBreweryIds)

  console.log('[freshness] reading mirror …')
  const pool = new Pool({ connectionString })
  let mirror: MirrorSnapshot
  try {
    mirror = await readMirror(pool)
  } finally {
    await pool.end()
  }

  console.log('')
  console.log('Sakenowa freshness check')
  console.log('─'.repeat(50))
  console.log(`brands     upstream=${upstreamBrands.brands.length}\tmirror=${mirror.brandCount}\tdelta=${pctDelta(mirror.brandCount, upstreamBrands.brands.length)}`)
  console.log(`breweries  upstream=${upstreamBreweries.breweries.length}\tmirror=${mirror.breweryCount}\tdelta=${pctDelta(mirror.breweryCount, upstreamBreweries.breweries.length)}`)
  console.log(`max(brand_id)    upstream=${maxUpstreamBrandId}\tmirror=${mirror.maxBrandId ?? '∅'}`)
  console.log(`max(brewery_id)  upstream=${maxUpstreamBreweryId}\tmirror=${mirror.maxBreweryId ?? '∅'}`)

  console.log('')
  console.log('Canary check (in-the-wild bottles)')
  console.log('─'.repeat(50))
  const missingBrands: string[] = []
  for (const kanji of CANARY_BRANDS) {
    const present = mirror.presentBrandKanji.has(kanji)
    console.log(`  brand     ${present ? '✓' : '✗'}  ${kanji}`)
    if (!present) missingBrands.push(kanji)
  }
  const missingBreweries: string[] = []
  for (const kanji of CANARY_BREWERIES) {
    const present = mirror.presentBreweryKanji.has(kanji)
    console.log(`  brewery   ${present ? '✓' : '✗'}  ${kanji}`)
    if (!present) missingBreweries.push(kanji)
  }

  console.log('')

  const countDeltaPct =
    upstreamBrands.brands.length > 0
      ? ((upstreamBrands.brands.length - mirror.brandCount) / upstreamBrands.brands.length) * 100
      : 0
  const tooFar = countDeltaPct > 1 || mirror.brandCount > upstreamBrands.brands.length

  if (missingBrands.length === 0 && missingBreweries.length === 0 && !tooFar) {
    console.log('✓ mirror is up to date and the canary set resolves.')
    return 0
  }

  if (missingBrands.length > 0 || missingBreweries.length > 0) {
    console.log(`✗ canary set has gaps:`)
    if (missingBrands.length > 0) console.log(`    missing brands:     ${missingBrands.join(', ')}`)
    if (missingBreweries.length > 0) console.log(`    missing breweries: ${missingBreweries.join(', ')}`)
  }
  if (tooFar) {
    console.log(`✗ brand-count delta > 1 % — mirror is stale or partial.`)
  }
  console.log('')
  console.log('Likely fix: re-run `pnpm ingest` against this DATABASE_URL.')
  return 1
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error('[freshness] failed:', err instanceof Error ? err.message : err)
  process.exit(2)
})
