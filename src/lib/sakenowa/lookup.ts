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
  | { kind: 'ambiguous'; candidates: readonly Brand[]; query: SakeLookupQuery }
  | { kind: 'no_match'; query: SakeLookupQuery }

// Pulls brand rows whose `name_kanji` matches exactly AND whose joined
// brewery's `name_kanji` matches exactly. LIMIT 2 — we don't need every
// candidate; we only need to know whether the match is unique (1 row) or
// ambiguous (2+).
const SELECT_BRANDS_BY_KANJI_EXTRACTION = `
  SELECT br.brand_id, br.name, br.name_kanji, br.name_romaji, br.brewery_id, br.source, br.confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE br.name_kanji = $1 AND b.name_kanji = $2
  ORDER BY br.brand_id
  LIMIT 2
`

export async function findSakeByExtractionFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<FindSakeByExtractionResult> {
  debugAdd(
    'Sakenowa',
    `querying brands WHERE name_kanji = '${query.nameJa}' AND brewery.name_kanji = '${query.breweryJa}'`,
    { nameJa: query.nameJa, breweryJa: query.breweryJa },
  )
  const { rows } = await publicQuery<BrandRow>(
    'brands',
    SELECT_BRANDS_BY_KANJI_EXTRACTION,
    [query.nameJa, query.breweryJa],
    pool,
  )
  debugAdd('Sakenowa', `query returned ${rows.length} row(s)`)
  if (rows.length === 0) {
    return { kind: 'no_match', query }
  }
  if (rows.length === 1) {
    return { kind: 'exact', sake: rowToBrand(rows[0]) }
  }
  return {
    kind: 'ambiguous',
    candidates: rows.map(rowToBrand),
    query,
  }
}

export async function findSakeByExtraction(
  query: SakeLookupQuery,
): Promise<FindSakeByExtractionResult> {
  return findSakeByExtractionFromPool(query, getServerDbPool())
}
