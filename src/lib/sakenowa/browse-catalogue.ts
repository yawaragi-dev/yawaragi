import 'server-only'

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { getServerDbPool } from '@/lib/supabase/server-client'
import { publicQuery } from '@/lib/supabase/public-query'
import { catalogueAxisStats } from '@/lib/taste/catalogue-mean'
import { flavorBound, type BrowseFilter } from '@/lib/sakenowa/browse-filter'
import type { CatalogueSearchResult } from '@/lib/sakenowa/search-brands'

/** A filtered list is A–Z and can be long; past this many it says "first". */
export const MAX_BROWSE_RESULTS = 200

interface BrowseRow {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  brewery_kanji: string | null
  brewery_romaji: string | null
}

export type BrowseOutcome = { kind: 'ok'; matches: CatalogueSearchResult[] } | { kind: 'unavailable' }

/**
 * §8's browse (design v1.8, M): the catalogue's sakes from one prefecture,
 * or that clearly stand out on one flavor axis, or both, A–Z. No popularity
 * order anywhere (M4). The axis is compared with the catalogue average (one
 * "clearly different" spread, as "Goes with"), so a sake without a chart is
 * never in a flavor list.
 *
 * Never throws, like `searchCatalogue`: Search still has its field and its
 * camera bridge when the mirror is out of reach.
 */
export async function browseCatalogue(filter: BrowseFilter): Promise<BrowseOutcome> {
  try {
    const conditions: string[] = ['b.superseded_at IS NULL']
    const values: unknown[] = []
    if (filter.areaId !== null) {
      values.push(filter.areaId)
      conditions.push(`br.area_id = $${values.length}`)
    }
    if (filter.flavor !== null) {
      const stats = await catalogueAxisStats()
      if (!stats) return { kind: 'unavailable' }
      values.push(flavorBound(stats, filter.flavor))
      // The column comes from the FlavorAxis enum, never from the address.
      const column = `fc.${filter.flavor.axis}`
      conditions.push(`${column} ${filter.flavor.direction === 'more' ? '>=' : '<='} $${values.length}`)
    }
    values.push(MAX_BROWSE_RESULTS)
    const { rows } = await publicQuery<BrowseRow>(
      'brands',
      `SELECT b.brand_id, b.name_kanji, b.name_romaji,
              br.name_kanji AS brewery_kanji, br.name_romaji AS brewery_romaji
         FROM brands b
         LEFT JOIN breweries br ON br.brewery_id = b.brewery_id AND br.superseded_at IS NULL
         ${filter.flavor !== null ? 'JOIN flavor_charts fc ON fc.brand_id = b.brand_id' : ''}
        WHERE ${conditions.join(' AND ')}
        ORDER BY lower(coalesce(b.name_romaji, b.name_kanji)), b.brand_id
        LIMIT $${values.length}`,
      values,
      getServerDbPool(),
    )
    return {
      kind: 'ok',
      matches: rows.map((row) => ({
        brandId: row.brand_id,
        nameKanji: row.name_kanji,
        nameRomaji: row.name_romaji,
        breweryKanji: row.brewery_kanji,
        breweryRomaji: row.brewery_romaji,
      })),
    }
  } catch {
    return { kind: 'unavailable' }
  }
}

const cachedPrefectureCounts = unstable_cache(
  async (): Promise<Record<number, number>> => {
    const { rows } = await publicQuery<{ area_id: number; count: number }>(
      'brands',
      `SELECT br.area_id, count(*)::int AS count
         FROM brands b
         JOIN breweries br ON br.brewery_id = b.brewery_id AND br.superseded_at IS NULL
        WHERE b.superseded_at IS NULL AND br.area_id > 0
        GROUP BY br.area_id`,
      [],
      getServerDbPool(),
    )
    return Object.fromEntries(rows.map((row) => [row.area_id, row.count]))
  },
  ['catalogue-prefecture-counts-v1'],
  { revalidate: 6 * 60 * 60 },
)

/**
 * How many catalogue sakes each prefecture has, for the Prefecture chip's
 * buttons. Cached six hours, as the axis stats are; `null` when the mirror
 * cannot be read, and the chip then shows the names alone.
 */
export const prefectureCounts = cache(async (): Promise<Record<number, number> | null> => {
  try {
    return await cachedPrefectureCounts()
  } catch {
    return null
  }
})
