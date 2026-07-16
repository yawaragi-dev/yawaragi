import 'server-only'

import type { Pool } from 'pg'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import type { FlavorCandidate } from '@/lib/taste/taste-recommender'

/**
 * The candidate pool the Phase 5 recommender ranks a User's taste vector
 * against: every charted Sake (a brand that has a six-axis flavor vector),
 * with its names for rendering. Sourced from the Sakenowa mirror (public data,
 * pg-direct per ADR-0010), superseded rows filtered (ADR-0014).
 */
export interface FlavorCandidatePoolRow extends FlavorCandidate {
  nameJa: string
  nameRomaji: string | null
}

interface PoolQueryRow {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  // pg returns numeric columns as strings — converted in poolRowToCandidate.
  f1: string
  f2: string
  f3: string
  f4: string
  f5: string
  f6: string
}

/** Pure row → candidate mapper (Number-converts the axes). Exported for tests. */
export function poolRowToCandidate(row: PoolQueryRow): FlavorCandidatePoolRow {
  return {
    brandId: row.brand_id,
    nameJa: row.name_kanji,
    nameRomaji: row.name_romaji,
    f1: Number(row.f1),
    f2: Number(row.f2),
    f3: Number(row.f3),
    f4: Number(row.f4),
    f5: Number(row.f5),
    f6: Number(row.f6),
  }
}

// Bounded — the recommender ranks in-memory, and the pool is re-fetched per
// /profile render today.
// TODO(perf): cache this. The pool is identical for all users and only changes
// on ingest, so it belongs behind unstable_cache with an ingest-scale revalidate.
export const FLAVOR_CANDIDATE_POOL_LIMIT = 2000

const SELECT_FLAVOR_CANDIDATE_POOL = `
  SELECT b.brand_id, b.name_kanji, b.name_romaji, fc.f1, fc.f2, fc.f3, fc.f4, fc.f5, fc.f6
  FROM flavor_charts fc
  JOIN brands b ON b.brand_id = fc.brand_id
  WHERE b.superseded_at IS NULL
  ORDER BY b.brand_id
  LIMIT $1
`

export async function getFlavorCandidatePoolFromPool(
  pool: Pool,
  limit: number = FLAVOR_CANDIDATE_POOL_LIMIT,
): Promise<FlavorCandidatePoolRow[]> {
  const { rows } = await publicQuery<PoolQueryRow>(
    'flavor_charts',
    SELECT_FLAVOR_CANDIDATE_POOL,
    [limit],
    pool,
  )
  return rows.map(poolRowToCandidate)
}

/**
 * Server-component entry point. Degrades to an empty pool when the DB is
 * unreachable — `getServerDbPool()` throws without `DATABASE_URL` (CI e2e runs
 * without it), and an unguarded throw here would 500 the whole /profile render
 * rather than just show no recommendations.
 */
export async function getFlavorCandidatePool(
  limit: number = FLAVOR_CANDIDATE_POOL_LIMIT,
): Promise<FlavorCandidatePoolRow[]> {
  try {
    return await getFlavorCandidatePoolFromPool(getServerDbPool(), limit)
  } catch {
    return []
  }
}
