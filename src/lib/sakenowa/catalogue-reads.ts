import 'server-only'
import type { Pool } from 'pg'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import type { Ranking, RankingKind } from '@/lib/schemas/ranking'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
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

// Catalogue reads by id, and the short lists a page shows: a sake, its
// brewery, its flavor chart, the brewery's other sakes, a ranking. The
// label-matching cascade, which finds a sake from what a label says, is
// in `label-match.ts`.
//
// Every function takes the pool last and defaults it to the app's
// (`getServerDbPool()`); integration tests pass their testcontainer pool.
// The default is evaluated when the function is called, inside the async
// function, so a missing `DATABASE_URL` is a rejected promise the caller
// can catch, never a synchronous throw.

// All read queries filter `superseded_at IS NULL` so manual_curation
// rows superseded by a later Sakenowa publish disappear from the
// public read path while remaining in the table for audit. ADR-0014.
const SELECT_BRAND_BY_ID = `
  SELECT brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence
  FROM brands
  WHERE brand_id = $1 AND superseded_at IS NULL
`

export async function lookupBrand(brandId: number, pool: Pool = getServerDbPool()): Promise<Brand | null> {
  const { rows } = await publicQuery<BrandRow>('brands', SELECT_BRAND_BY_ID, [brandId], pool)
  if (rows.length === 0) return null
  return rowToBrand(rows[0])
}

// JOIN-via-brand so the public contract stays brand-keyed (the page has a
// brandId; it shouldn't need to know the brewery_id to fetch a brewery).
const SELECT_BREWERY_BY_BRAND_ID = `
  SELECT b.brewery_id, b.name, b.name_kanji, b.name_romaji, b.area_id, b.source, b.confidence
  FROM breweries b
  JOIN brands br ON br.brewery_id = b.brewery_id
  WHERE br.brand_id = $1
    AND b.superseded_at IS NULL
    AND br.superseded_at IS NULL
`

export async function lookupBreweryByBrand(
  brandId: number,
  pool: Pool = getServerDbPool(),
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

const SELECT_FLAVOR_CHART_BY_BRAND_ID = `
  SELECT brand_id, f1, f2, f3, f4, f5, f6, source, confidence
  FROM flavor_charts
  WHERE brand_id = $1
`

export async function lookupFlavorChart(
  brandId: number,
  pool: Pool = getServerDbPool(),
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

/**
 * The brewery's OTHER sakes — design v1.4 §9.9, "The brewery: story plus a
 * row of its other sakes."
 *
 * Why this exists at all: a visitor who searches "dassai" lands on one brand
 * and has no route to the other ones the same brewery makes (#325). 781 of
 * the catalogue's 1,354 breweries publish more than one brand, so for most
 * bottles this row is populated — and the missing link was a genuine dead end,
 * not a nice-to-have.
 *
 * Brewery-keyed via the brand, like `lookupBreweryByBrand` above, so the
 * caller still only needs the brandId it already has. The current brand is
 * excluded in SQL rather than filtered in JS, so `LIMIT` counts the rows the
 * page will actually show.
 *
 * Ordering is the same shortest-name-first rule `searchCatalogue` uses: with
 * no popularity signal in the mirror, the shortest name is the closest thing
 * to "the one they mean" — 獺祭 before 獺祭 磨き二割三分.
 */
const SELECT_SIBLING_BRANDS = `
  SELECT brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence
  FROM brands
  WHERE brewery_id = (
      SELECT brewery_id FROM brands WHERE brand_id = $1 AND superseded_at IS NULL
    )
    AND brand_id <> $1
    AND superseded_at IS NULL
  ORDER BY char_length(name_kanji) ASC, name_kanji ASC, brand_id ASC
  LIMIT $2
`

export async function listSiblingBrands(
  brandId: number,
  limit = 8,
  pool: Pool = getServerDbPool(),
): Promise<readonly Brand[]> {
  const { rows } = await publicQuery<BrandRow>(
    'brands',
    SELECT_SIBLING_BRANDS,
    [brandId, limit],
    pool,
  )
  return rows.map(rowToBrand)
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

export async function listRanking(
  args: ListRankingArgs,
  pool: Pool = getServerDbPool(),
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
