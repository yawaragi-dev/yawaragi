import 'server-only'
import type { Pool } from 'pg'
import { debugAdd } from '@/lib/debug/debug-log'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import type { Ranking, RankingKind } from '../schemas/ranking'
import {
  type BrandRow,
  type BreweryRow,
  type FlavorChartRow,
  type RankingRow,
  rowToBrand,
  rowToBrewery,
  rowToFlavorChart,
  rowToRanking,
} from './db'
import { generateKanjiVariants } from './kanji-variants'
import { publicQuery } from '../supabase/public-query'
import { getServerDbPool } from '../supabase/server-client'

const SELECT_BRAND_BY_ID = `
  SELECT brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence
  FROM brands
  WHERE brand_id = $1
`

export async function lookupBrandFromPool(brandId: number, pool: Pool): Promise<Brand | null> {
  const { rows } = await publicQuery<BrandRow>('brands', SELECT_BRAND_BY_ID, [brandId], pool)
  if (rows.length === 0) return null
  return rowToBrand(rows[0])
}

/**
 * Read-side helper. Server-only. Server components and route handlers call
 * this; tests should use `lookupBrandFromPool(brandId, testcontainerPool)`
 * instead so they don't depend on a `DATABASE_URL` env var.
 */
export async function lookupBrand(brandId: number): Promise<Brand | null> {
  return lookupBrandFromPool(brandId, getServerDbPool())
}

// JOIN-via-brand so the public contract stays brand-keyed (the page has a
// brandId; it shouldn't need to know the brewery_id to fetch a brewery).
const SELECT_BREWERY_BY_BRAND_ID = `
  SELECT b.brewery_id, b.name, b.name_kanji, b.name_romaji, b.area_id, b.source, b.confidence
  FROM breweries b
  JOIN brands br ON br.brewery_id = b.brewery_id
  WHERE br.brand_id = $1
`

export async function lookupBreweryByBrandFromPool(
  brandId: number,
  pool: Pool,
): Promise<Brewery | null> {
  const { rows } = await publicQuery<BreweryRow>(
    'breweries',
    SELECT_BREWERY_BY_BRAND_ID,
    [brandId],
    pool,
  )
  if (rows.length === 0) return null
  return rowToBrewery(rows[0])
}

export async function lookupBreweryByBrand(brandId: number): Promise<Brewery | null> {
  return lookupBreweryByBrandFromPool(brandId, getServerDbPool())
}

const SELECT_FLAVOR_CHART_BY_BRAND_ID = `
  SELECT brand_id, f1, f2, f3, f4, f5, f6, source, confidence
  FROM flavor_charts
  WHERE brand_id = $1
`

export async function lookupFlavorChartFromPool(
  brandId: number,
  pool: Pool,
): Promise<FlavorChart | null> {
  const { rows } = await publicQuery<FlavorChartRow>(
    'flavor_charts',
    SELECT_FLAVOR_CHART_BY_BRAND_ID,
    [brandId],
    pool,
  )
  if (rows.length === 0) return null
  return rowToFlavorChart(rows[0])
}

export async function lookupFlavorChart(brandId: number): Promise<FlavorChart | null> {
  return lookupFlavorChartFromPool(brandId, getServerDbPool())
}

// listRanking returns the top-N rows for a single ranking scope. For
// kind='area' the caller must pass `areaId`; for kind='overall' the
// scope is implicit (one global list per ADR-0002).
export interface ListRankingArgs {
  kind: RankingKind
  limit: number
  areaId?: number
}

const LIST_RANKING_OVERALL = `
  SELECT kind, area_id, rank, brand_id, score, source, confidence
  FROM rankings
  WHERE kind = 'overall'
  ORDER BY rank ASC
  LIMIT $1
`

const LIST_RANKING_AREA = `
  SELECT kind, area_id, rank, brand_id, score, source, confidence
  FROM rankings
  WHERE kind = 'area' AND area_id = $1
  ORDER BY rank ASC
  LIMIT $2
`

export async function listRankingFromPool(
  args: ListRankingArgs,
  pool: Pool,
): Promise<Ranking[]> {
  if (args.limit <= 0) return []
  if (args.kind === 'overall') {
    const { rows } = await publicQuery<RankingRow>(
      'rankings',
      LIST_RANKING_OVERALL,
      [args.limit],
      pool,
    )
    return rows.map(rowToRanking)
  }
  if (args.areaId === undefined) {
    throw new Error("listRanking: kind='area' requires an areaId")
  }
  const { rows } = await publicQuery<RankingRow>(
    'rankings',
    LIST_RANKING_AREA,
    [args.areaId, args.limit],
    pool,
  )
  return rows.map(rowToRanking)
}

export async function listRanking(args: ListRankingArgs): Promise<Ranking[]> {
  return listRankingFromPool(args, getServerDbPool())
}

// ---------- findSakeByExtraction ----------
//
// Given a `LabelScanExtraction` (kanji name + kanji brewery), resolve it
// to a Sakenowa-mirrored Sake brand. PRD #105 §"Sakenowa lookup for
// extraction" — match strategy is exact on `brands.name_kanji` joined to
// `breweries.name_kanji`. Romaji is deliberately NOT a fallback at this
// seam: CONTEXT.md "Same-romaji collisions are possible across Breweries
// and Sakes", and the LLM extraction returns Japanese script.
//
// The function returns a tagged union so the caller (the Server Action,
// the result UI) branches on `kind` rather than on tuple-of-arrays
// patterns that hide intent.
//
// Ambiguous-match seeding is deferred to S4 per the issue spec; the
// `ambiguous` arm exists from day 1 so the union is closed and the UI
// renders the placeholder in case Sakenowa produces a duplicate name
// pair in the wild.

/**
 * What the lookup matched against. Captures both fields the caller passed
 * so result-UI copy ("we couldn't find 獺祭 by 旭酒造") doesn't have to
 * re-thread the extraction back through props.
 */
export interface SakeLookupQuery {
  nameJa: string
  breweryJa: string
}

export type FindSakeByExtractionResult =
  | { kind: 'exact'; sake: Brand }
  /**
   * The first-pass `(brand AND brewery)` join returned zero, but the
   * brand-only fallback (#123) found exactly one row. The brand is
   * unambiguously identified, but the brewery the model extracted
   * doesn't match what Sakenowa stores for that brand. UI MUST
   * surface this divergence honestly — silently navigating to a sake
   * whose brewery doesn't match the label is worse than saying "we're
   * not sure". `breweryDivergence.stored` is the canonical brewery
   * kanji from Sakenowa; `extracted` is what the model returned.
   */
  | {
      kind: 'matched_brand_only'
      sake: Brand
      brewery: Brewery
      breweryDivergence: { extracted: string; stored: string }
      query: SakeLookupQuery
    }
  /**
   * The structural dual of `matched_brand_only`. First-pass missed,
   * brand-only fallback also missed, but a third-pass brewery-only
   * lookup found exactly one brand under that brewery. The brewery
   * is unambiguously identified (a mono-brand brewery, or a brewery
   * where Sakenowa has only one brand line), but the brand the model
   * extracted doesn't match what Sakenowa stores for that brewery.
   * Same divergence-surfacing UX as `matched_brand_only` — UI shows
   * the gap honestly and requires an explicit tap to navigate.
   * `brandDivergence.stored` is the canonical brand kanji from
   * Sakenowa; `extracted` is what the model returned.
   */
  | {
      kind: 'matched_brewery_only'
      sake: Brand
      brewery: Brewery
      brandDivergence: { extracted: string; stored: string }
      query: SakeLookupQuery
    }
  | { kind: 'ambiguous'; candidates: readonly Brand[]; query: SakeLookupQuery }
  | { kind: 'no_match'; query: SakeLookupQuery }

// First-pass: pulls brand rows whose `name_kanji` matches exactly AND
// whose joined brewery's `name_kanji` matches exactly. LIMIT 2 — we
// don't need every candidate; we only need to know whether the match
// is unique (1 row) or ambiguous (2+).
const SELECT_BRANDS_BY_KANJI_EXTRACTION = `
  SELECT br.brand_id, br.name, br.name_kanji, br.name_romaji, br.brewery_id, br.source, br.confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  -- ANY($1) / ANY($2) match the kanji-variant-expanded arrays so a
  -- vision-model output that uses 新字体 (new-form, e.g. 蔵王) still
  -- joins against Sakenowas 旧字体 row (e.g. 藏王). The variant
  -- expansion happens in JS in generateKanjiVariants. Most strings
  -- expand to 1 element (no variant kanji); worst case is 2-3
  -- elements, well within ANY()s performance envelope.
  WHERE br.name_kanji = ANY($1) AND b.name_kanji = ANY($2)
  ORDER BY br.brand_id
  LIMIT 2
`

// Second-pass (#123): brand kanji only — used when the first pass
// returns 0 rows. Pulls brand columns AND brewery columns from the
// same JOIN so the matched_brand_only branch has the stored brewery
// kanji to surface in the divergence UI without a second round-trip.
// Column aliases are namespaced (`brand_*` / `brewery_*`) because both
// tables carry overlapping column names (brand_id, name, name_kanji,
// source, confidence) — the namespacing makes the pg row object
// unambiguous to deserialise.
//
// Third-pass (brewery-only) below uses the same joined shape under a
// different WHERE clause.
const SELECT_BRANDS_AND_BREWERIES_BY_BRAND_KANJI = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE br.name_kanji = ANY($1)
  ORDER BY br.brand_id
  LIMIT 2
`

// Third-pass: brewery kanji only — used when the first pass AND the
// brand-only second pass both return 0 rows. Real-world motivation
// (2026-06-11 testing): a Takashimizu bottle where the model
// returned a hallucinated brand `寺田` but read the brewery correctly
// as `高清水酒造`. Brand-only fallback missed (no Sakenowa brand is
// `寺田`); brewery-only fallback finds the Takashimizu line because
// the brewery exists. Mono-brand breweries match cleanly here;
// multi-brand breweries return 2+ rows and route to ambiguous
// (which S4 PR B's disambiguation list will surface properly).
const SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_KANJI = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE b.name_kanji = ANY($1)
  ORDER BY br.brand_id
  LIMIT 2
`

interface BrandWithBreweryRow {
  brand_brand_id: number
  brand_name: string
  brand_name_kanji: string
  brand_name_romaji: string | null
  brand_brewery_id: number
  brand_source: BrandRow['source']
  brand_confidence: string | null
  brewery_brewery_id: number
  brewery_name: string
  brewery_name_kanji: string
  brewery_name_romaji: string | null
  brewery_area_id: number
  brewery_source: BreweryRow['source']
  brewery_confidence: string | null
}

function brandFromJoinedRow(row: BrandWithBreweryRow): Brand {
  return rowToBrand({
    brand_id: row.brand_brand_id,
    name: row.brand_name,
    name_kanji: row.brand_name_kanji,
    name_romaji: row.brand_name_romaji,
    brewery_id: row.brand_brewery_id,
    source: row.brand_source,
    confidence: row.brand_confidence,
  })
}

function breweryFromJoinedRow(row: BrandWithBreweryRow): Brewery {
  return rowToBrewery({
    brewery_id: row.brewery_brewery_id,
    name: row.brewery_name,
    name_kanji: row.brewery_name_kanji,
    name_romaji: row.brewery_name_romaji,
    area_id: row.brewery_area_id,
    source: row.brewery_source,
    confidence: row.brewery_confidence,
  })
}

export async function findSakeByExtractionFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<FindSakeByExtractionResult> {
  // Expand each kanji input to its old-form / new-form siblings so a
  // model output of 蔵王 (新字体) matches Sakenowa's 藏王 (旧字体).
  // For strings without variant kanji, the arrays collapse to a
  // single element and the query behaves identically to the previous
  // exact-match shape.
  const nameVariants = generateKanjiVariants(query.nameJa)
  const breweryVariants = generateKanjiVariants(query.breweryJa)
  debugAdd(
    'Sakenowa',
    `first-pass: querying brands WHERE name_kanji ∈ {${nameVariants.join('|')}} AND brewery.name_kanji ∈ {${breweryVariants.join('|')}}`,
    {
      nameJa: query.nameJa,
      breweryJa: query.breweryJa,
      nameVariants,
      breweryVariants,
    },
  )
  const { rows } = await publicQuery<BrandRow>(
    'brands',
    SELECT_BRANDS_BY_KANJI_EXTRACTION,
    [nameVariants, breweryVariants],
    pool,
  )
  debugAdd('Sakenowa', `first-pass returned ${rows.length} row(s)`)
  if (rows.length === 1) {
    return { kind: 'exact', sake: rowToBrand(rows[0]) }
  }
  if (rows.length >= 2) {
    return {
      kind: 'ambiguous',
      candidates: rows.map(rowToBrand),
      query,
    }
  }

  // First pass returned 0. Brewery names are smaller on most labels,
  // often stylised, and the model's correctness rate on brewery is
  // meaningfully worse than on brand (issue #123 motivating example:
  // 蔵王 bottle where the model hallucinated 宮鉄酒造 — brand kanji
  // correct, brewery kanji invented). Retry brand-only and surface
  // the divergence if exactly one brand matches.
  debugAdd(
    'Sakenowa',
    `first-pass returned 0 rows; trying brand-only fallback (#123) on name_kanji ∈ {${nameVariants.join('|')}}`,
  )
  const { rows: brandOnlyRows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_BRAND_KANJI,
    [nameVariants],
    pool,
  )
  debugAdd('Sakenowa', `brand-only fallback returned ${brandOnlyRows.length} row(s)`)

  if (brandOnlyRows.length === 1) {
    const matched = brandOnlyRows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    return {
      kind: 'matched_brand_only',
      sake: brand,
      brewery,
      breweryDivergence: {
        extracted: query.breweryJa,
        stored: brewery.nameKanji,
      },
      query,
    }
  }
  if (brandOnlyRows.length >= 2) {
    return {
      kind: 'ambiguous',
      candidates: brandOnlyRows.map(brandFromJoinedRow),
      query,
    }
  }

  // Brand-only fallback returned 0. Try brewery-only — the structural
  // dual of #123. Real-world failure shape: Takashimizu bottle, model
  // returns brewery 高清水酒造 correctly but brand `寺田` (a
  // hallucinated surname). Brand-only misses; brewery-only finds the
  // single Takashimizu brand line and we surface the divergence on
  // the brand field this time. Mono-brand breweries land here
  // cleanly; multi-brand breweries return 2+ rows and route to
  // ambiguous.
  debugAdd(
    'Sakenowa',
    `brand-only fallback returned 0 rows; trying brewery-only fallback on brewery.name_kanji ∈ {${breweryVariants.join('|')}}`,
  )
  const { rows: breweryOnlyRows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_KANJI,
    [breweryVariants],
    pool,
  )
  debugAdd('Sakenowa', `brewery-only fallback returned ${breweryOnlyRows.length} row(s)`)

  if (breweryOnlyRows.length === 0) {
    return { kind: 'no_match', query }
  }
  if (breweryOnlyRows.length === 1) {
    const matched = breweryOnlyRows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    return {
      kind: 'matched_brewery_only',
      sake: brand,
      brewery,
      brandDivergence: {
        extracted: query.nameJa,
        stored: brand.nameKanji,
      },
      query,
    }
  }
  return {
    kind: 'ambiguous',
    candidates: breweryOnlyRows.map(brandFromJoinedRow),
    query,
  }
}

export async function findSakeByExtraction(
  query: SakeLookupQuery,
): Promise<FindSakeByExtractionResult> {
  return findSakeByExtractionFromPool(query, getServerDbPool())
}
