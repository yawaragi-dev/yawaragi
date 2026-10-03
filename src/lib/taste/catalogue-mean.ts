import 'server-only'

import { cache } from 'react'
import type { Pool } from 'pg'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * The average sake, per axis — the reference §12's axis rows are read against.
 *
 * §12 draws "a 2px neutral-700 tick for the typical drinker". We do not have a
 * population of drinkers and cannot yet: aggregating ratings needs §12's own
 * one-time opt-in (#297) and a lawful basis that is not in ADR-0009's RoPA.
 * The catalogue's mean is the honest stand-in, and the copy names it as such —
 * "more than most sakes", never "more than most drinkers". `palate-read.ts`
 * carries the full reasoning.
 *
 * Averaged in SQL rather than by fetching 1,459 chart rows to reduce them in
 * JS: one row over the wire, and Postgres is better at this than we are.
 *
 * `cache()` dedupes within a request. It is NOT a cross-request cache — the
 * value only changes on ingest, so it belongs behind `unstable_cache` with an
 * ingest-scale revalidate, the same TODO `flavor-candidate-pool.ts` carries.
 */
interface MeanRow {
  // pg returns AVG(numeric) as a string.
  f1: string | null
  f2: string | null
  f3: string | null
  f4: string | null
  f5: string | null
  f6: string | null
}

const SELECT_CATALOGUE_MEAN = `
  SELECT AVG(fc.f1) AS f1, AVG(fc.f2) AS f2, AVG(fc.f3) AS f3,
         AVG(fc.f4) AS f4, AVG(fc.f5) AS f5, AVG(fc.f6) AS f6
  FROM flavor_charts fc
  JOIN brands b ON b.brand_id = fc.brand_id
  WHERE b.superseded_at IS NULL
`

/** Pure row → profile mapper. `null` when the mirror has no charts at all. */
export function meanRowToProfile(row: MeanRow | undefined): FlavorProfile | null {
  if (!row || row.f1 === null) return null
  const axes = [row.f1, row.f2, row.f3, row.f4, row.f5, row.f6]
  if (axes.some((value) => value === null)) return null
  const [f1, f2, f3, f4, f5, f6] = axes.map((value) => Number(value))
  if ([f1, f2, f3, f4, f5, f6].some((value) => Number.isNaN(value))) return null
  return { f1, f2, f3, f4, f5, f6 }
}

export async function catalogueMeanProfileFromPool(pool: Pool): Promise<FlavorProfile | null> {
  const { rows } = await publicQuery<MeanRow>('flavor_charts', SELECT_CATALOGUE_MEAN, [], pool)
  return meanRowToProfile(rows[0])
}

/**
 * Degrades to `null` rather than throwing. The axis rows render without the
 * tick and without the word label when there is no reference — a page that
 * 500s because a comparison line is missing would be the defect
 * `rsc-db-calls-must-degrade` exists to prevent, and CI's Playwright run has
 * no `DATABASE_URL` at all.
 */
export const catalogueMeanProfile = cache(async (): Promise<FlavorProfile | null> => {
  try {
    return await catalogueMeanProfileFromPool(getServerDbPool())
  } catch {
    return null
  }
})
