import 'server-only'

import { unstable_cache } from 'next/cache'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'

/**
 * The other names a sake is sold under (`name_aliases`, #413), for §9's
 * "Also sold as {names}" (design v1.7, E2). Curated rows, oldest first.
 *
 * Never throws: the bottle page is about the sake, and a missing line of
 * other names (no database on CI, a mirror the migration has not reached)
 * must not take it down. Cached like the page's other catalogue reads.
 */
export async function otherNamesOf(brandId: number): Promise<string[]> {
  try {
    return await cachedOtherNames(brandId)
  } catch {
    return []
  }
}

const cachedOtherNames = unstable_cache(
  async (brandId: number) => {
    const { rows } = await publicQuery<{ alias: string }>(
      'name_aliases',
      `SELECT alias FROM name_aliases WHERE kind = 'brand' AND id = $1 ORDER BY created_at, alias`,
      [brandId],
      getServerDbPool(),
    )
    return rows.map((row) => row.alias)
  },
  ['brand-other-names-v1'],
  { revalidate: 6 * 60 * 60 },
)
