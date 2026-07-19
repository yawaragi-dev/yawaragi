import 'server-only'
import type { Pool } from 'pg'
import type { Brand } from '@/lib/schemas/brand'
import { type BrandRow, rowToBrand } from '@/lib/sakenowa/db'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'

/**
 * Minimal deterministic sake search (P5.5-C2b, #244) — the picker behind the
 * journal "Log a sake" form (ADR-0020). No LLM, no ranking model: a
 * case-insensitive substring match over a brand's name / kanji / romaji, read
 * pg-direct from the public `brands` mirror (ADR-0010).
 *
 * This is the deliberately-small first cut of the wider search surface (#234);
 * the log form only needs "type a name, pick the sake". It stays a plain
 * `*From Pool` + convenience pair like the other Sakenowa read helpers so the
 * query is integration-tested against real Postgres.
 *
 * Only brands that HAVE a FlavorChart are returned (the INNER JOIN): the journal
 * can only place a sake in axis space if it has one, so `logSakeToJournal` would
 * otherwise skip a chartless pick — surfacing it in the picker would be a dead
 * end. Filtering here means every pick is loggable.
 */
export const MAX_BRAND_SEARCH_RESULTS = 10

/**
 * Escape LIKE metacharacters (`%`, `_`, and the escape char itself) so a
 * user-typed `%` matches a literal percent sign rather than "any run of
 * characters". The value is still passed as a bound parameter — this is about
 * match semantics, not injection.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

const SEARCH_BRANDS = `
  SELECT b.brand_id, b.name, b.name_kanji, b.name_romaji, b.brewery_id, b.source, b.confidence
  FROM brands b
  JOIN flavor_charts fc ON fc.brand_id = b.brand_id
  WHERE b.superseded_at IS NULL
    AND (b.name ILIKE $1 OR b.name_kanji ILIKE $1 OR b.name_romaji ILIKE $1)
  ORDER BY char_length(b.name) ASC, b.name ASC
  LIMIT $2
`

export async function searchBrandsFromPool(
  query: string,
  pool: Pool,
  limit: number = MAX_BRAND_SEARCH_RESULTS,
): Promise<Brand[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_BRAND_SEARCH_RESULTS)
  const { rows } = await publicQuery<BrandRow>('brands', SEARCH_BRANDS, [pattern, capped], pool)
  return rows.map(rowToBrand)
}

/**
 * App-facing read helper. Server-only. Tests use `searchBrandsFromPool(query,
 * testcontainerPool)` so they don't depend on a `DATABASE_URL` env var.
 */
export async function searchBrands(query: string, limit?: number): Promise<Brand[]> {
  return searchBrandsFromPool(query, getServerDbPool(), limit)
}
