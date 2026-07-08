/**
 * Maintainer utility — compares Sakenowa's upstream brand / brewery
 * data to our mirror, and probes a small canary set for presence.
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
 * `秋田酒類製造` (Brewery 56) but our mirror was missing them. Without
 * this script, the only way to detect the gap was a failed scan plus
 * a manual `curl + psql` triage round. This makes the gap surfaceable
 * in seconds without firing the vision model.
 *
 * Freshness model (see ADR-0016 — "data strategy: Sakenowa freshness"):
 * the old "the dump is frozen at 2024" framing is retired. The upstream
 * Data API is live and maintained (brand IDs climb past 121k), and the
 * `/api/cron/ingest` route re-pulls it on a schedule (daily — a superset
 * of ADR-0016's monthly minimum). Our mirror is an UPSERT-ONLY copy plus
 * a manual-curation layer (ADR-0014), so it legitimately holds MORE rows
 * than upstream: it never tombstones brands Sakenowa later drops, and it
 * carries hand-added rows Sakenowa never had. "More rows than upstream"
 * is therefore HEALTHY, not stale — the real staleness signals are (1)
 * the mirror MISSING a meaningful fraction of upstream brands, or (2) the
 * mirror's Sakenowa-source `max(brand_id)` lagging the upstream ID
 * frontier (the definitive "frozen" tell: a 2024 freeze caps us near 79k;
 * a live mirror reaches 121k+).
 *
 * Exits non-zero when any of:
 *   - the canary set has missing entries (an in-the-wild bottle would
 *     fail), OR
 *   - the mirror is missing > 1 % of upstream Sakenowa brands, OR
 *   - the mirror's Sakenowa max(brand_id) lags the upstream frontier.
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
 * Entries use the EXACT `name_kanji` Sakenowa stores (verified against
 * upstream), so the canary tests real data presence — not scan-time
 * kanji normalisation, which is a separate concern (#117). Add entries
 * here when a new in-the-wild bottle hits a mirror gap —
 * `docs/label-scan-recognition-obstacles.md` §17 has the running
 * narrative.
 */
const CANARY_BRANDS: ReadonlyArray<string> = [
  '獺祭', // Dassai (旭酒造)
  '八海山', // Hakkaisan
  '久保田', // Kubota
  '高清水', // Takashimizu — 2026-06-11 motivating gap
  '藏王', // Zao — Sakenowa stores the old-form 藏 (not 蔵). The 蔵王↔藏王
  //           scan-time normalisation is #117's concern; this canary
  //           tests the stored form so it reflects data presence.
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

/** Fraction of upstream brands the mirror may be missing before we call it stale. */
const MAX_MISSING_PCT = 1

async function fetchUpstream<T>(path: string): Promise<T> {
  const res = await fetch(`${SAKENOWA_BASE_URL}/${path}`)
  if (!res.ok) {
    throw new Error(`Sakenowa ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

interface MirrorSnapshot {
  /** Rows with `source = 'sakenowa'` — the set comparable to upstream. */
  sakenowaBrandCount: number
  sakenowaMaxBrandId: number | null
  sakenowaBreweryCount: number
  sakenowaMaxBreweryId: number | null
  /** All rows including the manual-curation layer (ADR-0014) — for display. */
  totalBrandCount: number
  totalBreweryCount: number
  /** Canary presence is checked across ALL sources (manual rows count too). */
  presentBrandKanji: Set<string>
  presentBreweryKanji: Set<string>
}

async function readMirror(pool: Pool): Promise<MirrorSnapshot> {
  const { rows: brandRows } = await pool.query<{
    sakenowa_count: string
    total_count: string
    sakenowa_max: string | null
  }>(
    `SELECT count(*) FILTER (WHERE source = 'sakenowa')::text AS sakenowa_count,
            count(*)::text AS total_count,
            max(brand_id) FILTER (WHERE source = 'sakenowa')::text AS sakenowa_max
       FROM brands`,
  )
  const { rows: breweryRows } = await pool.query<{
    sakenowa_count: string
    total_count: string
    sakenowa_max: string | null
  }>(
    `SELECT count(*) FILTER (WHERE source = 'sakenowa')::text AS sakenowa_count,
            count(*)::text AS total_count,
            max(brewery_id) FILTER (WHERE source = 'sakenowa')::text AS sakenowa_max
       FROM breweries`,
  )
  const { rows: brandKanjiRows } = await pool.query<{ name_kanji: string }>(
    `SELECT name_kanji FROM brands WHERE name_kanji = ANY($1::text[])`,
    [[...CANARY_BRANDS]],
  )
  const { rows: breweryKanjiRows } = await pool.query<{ name_kanji: string }>(
    `SELECT name_kanji FROM breweries WHERE name_kanji = ANY($1::text[])`,
    [[...CANARY_BREWERIES]],
  )

  const num = (v: string | null): number | null => (v === null ? null : Number(v))

  return {
    sakenowaBrandCount: Number(brandRows[0].sakenowa_count),
    sakenowaMaxBrandId: num(brandRows[0].sakenowa_max),
    sakenowaBreweryCount: Number(breweryRows[0].sakenowa_count),
    sakenowaMaxBreweryId: num(breweryRows[0].sakenowa_max),
    totalBrandCount: Number(brandRows[0].total_count),
    totalBreweryCount: Number(breweryRows[0].total_count),
    presentBrandKanji: new Set(brandKanjiRows.map((r) => r.name_kanji)),
    presentBreweryKanji: new Set(breweryKanjiRows.map((r) => r.name_kanji)),
  }
}

export interface FreshnessInput {
  upstreamBrandCount: number
  upstreamMaxBrandId: number
  mirrorSakenowaBrandCount: number
  mirrorSakenowaMaxBrandId: number | null
  missingCanaryBrands: readonly string[]
  missingCanaryBreweries: readonly string[]
}

export interface FreshnessVerdict {
  ok: boolean
  reasons: string[]
}

/**
 * Pure freshness decision — see the "Freshness model" note in the file
 * header for the rationale. Extracted so the pass/fail logic is unit
 * testable without a live Postgres or a network round-trip.
 */
export function assessFreshness(
  input: FreshnessInput,
  opts: { maxMissingPct?: number } = {},
): FreshnessVerdict {
  const maxMissingPct = opts.maxMissingPct ?? MAX_MISSING_PCT
  const reasons: string[] = []

  if (input.upstreamBrandCount > 0) {
    // Signed: negative means the mirror has MORE than upstream, which is
    // healthy (upsert-only + manual layer). Only a shortfall is stale.
    const missingPct =
      ((input.upstreamBrandCount - input.mirrorSakenowaBrandCount) /
        input.upstreamBrandCount) *
      100
    if (missingPct > maxMissingPct) {
      reasons.push(
        `mirror is missing ${missingPct.toFixed(2)} % of upstream Sakenowa brands (> ${maxMissingPct} %) — re-run \`pnpm ingest\``,
      )
    }
  }

  if (
    input.mirrorSakenowaMaxBrandId === null ||
    input.mirrorSakenowaMaxBrandId < input.upstreamMaxBrandId
  ) {
    reasons.push(
      `mirror Sakenowa max(brand_id)=${input.mirrorSakenowaMaxBrandId ?? '∅'} lags the upstream frontier ${input.upstreamMaxBrandId} — mirror is behind (a frozen 2024 dump caps near 79k; ADR-0016)`,
    )
  }

  if (input.missingCanaryBrands.length > 0) {
    reasons.push(`canary brands missing: ${input.missingCanaryBrands.join(', ')}`)
  }
  if (input.missingCanaryBreweries.length > 0) {
    reasons.push(`canary breweries missing: ${input.missingCanaryBreweries.join(', ')}`)
  }

  return { ok: reasons.length === 0, reasons }
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

  const manualBrands = mirror.totalBrandCount - mirror.sakenowaBrandCount
  const manualBreweries = mirror.totalBreweryCount - mirror.sakenowaBreweryCount

  console.log('')
  console.log('Sakenowa freshness check')
  console.log('─'.repeat(50))
  console.log(
    `brands     upstream=${upstreamBrands.brands.length}\tmirror(sakenowa)=${mirror.sakenowaBrandCount}\tdelta=${pctDelta(mirror.sakenowaBrandCount, upstreamBrands.brands.length)}`,
  )
  console.log(
    `breweries  upstream=${upstreamBreweries.breweries.length}\tmirror(sakenowa)=${mirror.sakenowaBreweryCount}\tdelta=${pctDelta(mirror.sakenowaBreweryCount, upstreamBreweries.breweries.length)}`,
  )
  console.log(
    `max(brand_id)    upstream=${maxUpstreamBrandId}\tmirror(sakenowa)=${mirror.sakenowaMaxBrandId ?? '∅'}`,
  )
  console.log(
    `max(brewery_id)  upstream=${maxUpstreamBreweryId}\tmirror(sakenowa)=${mirror.sakenowaMaxBreweryId ?? '∅'}`,
  )
  console.log(
    `manual-curation  brands=+${manualBrands}\tbreweries=+${manualBreweries}\t(ADR-0014 layer; excluded from the comparison above)`,
  )

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

  const verdict = assessFreshness({
    upstreamBrandCount: upstreamBrands.brands.length,
    upstreamMaxBrandId: maxUpstreamBrandId,
    mirrorSakenowaBrandCount: mirror.sakenowaBrandCount,
    mirrorSakenowaMaxBrandId: mirror.sakenowaMaxBrandId,
    missingCanaryBrands: missingBrands,
    missingCanaryBreweries: missingBreweries,
  })

  if (verdict.ok) {
    console.log('✓ mirror is up to date and the canary set resolves.')
    return 0
  }

  console.log('✗ mirror freshness check failed:')
  for (const reason of verdict.reasons) {
    console.log(`    - ${reason}`)
  }
  console.log('')
  console.log('Likely fix: re-run `pnpm ingest` against this DATABASE_URL.')
  return 1
}

// Only run the CLI when invoked directly, so `assessFreshness` can be
// imported into a unit test without triggering a DB connection + exit.
if (process.argv[1] && process.argv[1].endsWith('sakenowa-freshness-check.ts')) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[freshness] failed:', err instanceof Error ? err.message : err)
      process.exit(2)
    })
}
