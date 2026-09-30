import 'server-only'
import type { Pool } from 'pg'
import { findSimilarByFlavor, type FlavorAxes } from '@/lib/flavor/flavor-similarity'
import { FlavorChartSource } from '@/lib/schemas/flavor-chart'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'

/**
 * §6 "Similar sakes": the nearest brands to one brand, by flavour.
 *
 * Deterministic and model-free, which is §6's own rule — "Plain ranked list,
 * **no chat, no model call**" — and what lets the rows carry
 * `sakenowa_inferred` (ADR-0005: derived from Sakenowa by deterministic
 * maths).
 *
 * ## Why SQL narrows and JS ranks
 *
 * The catalogue has tens of thousands of charted brands, so neither end can do
 * the whole job:
 *
 * - Pulling every chart into the request to rank in JS would move megabytes
 *   per page view.
 * - Ranking entirely in SQL would mean a second implementation of the metric,
 *   and `flavor-similarity.ts` is explicit that it wants to be the one home
 *   for it ("a change to the formula breaks pre-computed expected distances").
 *
 * So Postgres orders by **L1** (sum of absolute axis differences) and returns a
 * shortlist, then `findSimilarByFlavor` re-ranks that shortlist by the
 * canonical **L2** distance. L1 and L2 agree closely on which vectors are
 * near — they differ in how they weight one large gap against several small
 * ones — so a shortlist of {@link CANDIDATE_POOL_SIZE} is far more than enough
 * to contain the true top five. The metric a visitor sees ordering rows is
 * still the one function every other caller uses.
 */

/** How many rows the SQL shortlist returns for JS to re-rank. */
const CANDIDATE_POOL_SIZE = 200

/**
 * §6: "**top 5**."
 *
 * §6's same sentence says "cosine similarity", and this path uses L2. That is
 * deliberate and pre-dates v1.4 — `flavor-similarity.ts` argues it at length
 * (these axes carry magnitude, so cosine reads a restrained profile and an
 * intense one as identical) — and the wording is with the designers as #308
 * §6. Quoting only the part this constant is about, so the next reader does
 * not take "cosine" for a description of the code below.
 */
export const SIMILAR_SAKES_LIMIT = 5

export interface SimilarBrand extends FlavorAxes {
  readonly brandId: number
  readonly nameKanji: string
  readonly nameRomaji: string | null
  readonly breweryKanji: string | null
  readonly breweryRomaji: string | null
  readonly chartSource: FlavorChartSource
}

export interface SimilarBrandMatch {
  readonly brand: SimilarBrand
  readonly distance: number
}

export interface SimilarBrandsResult {
  /** The subject's own six axes, so callers can describe the difference. */
  readonly target: FlavorAxes
  readonly matches: readonly SimilarBrandMatch[]
}

interface CandidateRow {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  brewery_kanji: string | null
  brewery_romaji: string | null
  f1: string
  f2: string
  f3: string
  f4: string
  f5: string
  f6: string
  chart_source: string
}

// `superseded_at IS NULL` on both joins per ADR-0014: a manual_curation row
// that Sakenowa has since published must not appear twice.
//
// The brewery join is LEFT: ~48 Sakenowa brands point at placeholder brewery
// rows, and a sake with an unknown brewery is still a valid similarity match.
const SELECT_NEAREST_BY_L1 = `
  SELECT
    b.brand_id,
    b.name_kanji,
    b.name_romaji,
    br.name_kanji   AS brewery_kanji,
    br.name_romaji  AS brewery_romaji,
    fc.f1, fc.f2, fc.f3, fc.f4, fc.f5, fc.f6,
    fc.source       AS chart_source
  FROM flavor_charts fc
  JOIN brands b
    ON b.brand_id = fc.brand_id
   AND b.superseded_at IS NULL
  LEFT JOIN breweries br
    ON br.brewery_id = b.brewery_id
   AND br.superseded_at IS NULL
  WHERE fc.brand_id <> $7
  ORDER BY
    abs(fc.f1 - $1) + abs(fc.f2 - $2) + abs(fc.f3 - $3)
  + abs(fc.f4 - $4) + abs(fc.f5 - $5) + abs(fc.f6 - $6)
  ASC, fc.brand_id ASC
  LIMIT $8
`

const SELECT_TARGET_CHART = `
  SELECT fc.f1, fc.f2, fc.f3, fc.f4, fc.f5, fc.f6
  FROM flavor_charts fc
  JOIN brands b ON b.brand_id = fc.brand_id AND b.superseded_at IS NULL
  WHERE fc.brand_id = $1
`

/**
 * Nearest brands to `brandId`, or `null` when the subject has no flavour chart.
 *
 * `null` is not an error: ADR-0016 records that roughly half the catalogue has
 * no `flavor_charts` row, and §6 specifies that state — "Empty (no profile for
 * this sake): a short line and the bottle-page link." The caller renders that,
 * rather than an empty list that reads as "nothing is similar".
 */
export async function findSimilarBrandsFromPool(
  brandId: number,
  pool: Pool,
  limit: number = SIMILAR_SAKES_LIMIT,
): Promise<SimilarBrandsResult | null> {
  const { rows: targetRows } = await publicQuery<Record<string, string>>(
    'flavor_charts',
    SELECT_TARGET_CHART,
    [brandId],
    pool,
  )
  if (targetRows.length === 0) return null

  const target = toAxes(targetRows[0])

  const { rows } = await publicQuery<CandidateRow>(
    'flavor_charts',
    SELECT_NEAREST_BY_L1,
    [target.f1, target.f2, target.f3, target.f4, target.f5, target.f6, brandId, CANDIDATE_POOL_SIZE],
    pool,
  )

  return { target, matches: rankCandidates(target, rows.map(toSimilarBrand), limit) }
}

/** Server-component entry point. Tests should pass their own pool instead. */
export async function findSimilarBrands(
  brandId: number,
  limit: number = SIMILAR_SAKES_LIMIT,
): Promise<SimilarBrandsResult | null> {
  return findSimilarBrandsFromPool(brandId, getServerDbPool(), limit)
}

/**
 * Re-rank a SQL shortlist by the canonical L2 metric. Exported so the ranking
 * is unit-testable without a database — the SQL only has to return a superset.
 */
export function rankCandidates(
  target: FlavorAxes,
  candidates: readonly SimilarBrand[],
  limit: number = SIMILAR_SAKES_LIMIT,
): SimilarBrandMatch[] {
  return findSimilarByFlavor(target, candidates, { limit }).map(({ candidate, distance }) => ({
    brand: candidate,
    distance,
  }))
}

/**
 * `NUMERIC` comes back from `pg` as a string — it does not fit a JS number
 * without loss in the general case, so the driver refuses to guess. These
 * columns are `NUMERIC(5,4)` in [0,1], which does fit, so parsing here is safe
 * and keeps the lossy-by-default behaviour where it belongs.
 */
function toAxes(row: Record<string, string>): FlavorAxes {
  return {
    f1: Number(row.f1),
    f2: Number(row.f2),
    f3: Number(row.f3),
    f4: Number(row.f4),
    f5: Number(row.f5),
    f6: Number(row.f6),
  }
}

function toSimilarBrand(row: CandidateRow): SimilarBrand {
  return {
    ...toAxes(row as unknown as Record<string, string>),
    brandId: row.brand_id,
    nameKanji: row.name_kanji,
    nameRomaji: row.name_romaji,
    breweryKanji: row.brewery_kanji,
    breweryRomaji: row.brewery_romaji,
    chartSource: FlavorChartSource.parse(row.chart_source),
  }
}
