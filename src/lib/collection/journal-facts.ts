import 'server-only'

import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { EntryFacts } from './journal-filter'

/**
 * The brewery prefecture of each catalogue sake in a journal, in one query.
 * An empty map when the catalogue cannot be read (CI has no database): the
 * journal still lists, the Prefecture chip just has nothing to offer.
 */
export async function brandPrefectures(brandIds: readonly number[]): Promise<Map<number, number>> {
  const ids = [...new Set(brandIds)]
  if (ids.length === 0) return new Map()
  try {
    const { rows } = await publicQuery<{ brand_id: number; area_id: number }>(
      'brands',
      `SELECT b.brand_id, br.area_id
         FROM brands b
         JOIN breweries br ON br.brewery_id = b.brewery_id
        WHERE b.brand_id = ANY($1::int[]) AND br.area_id > 0`,
      [ids],
      getServerDbPool(),
    )
    return new Map(rows.map((row) => [row.brand_id, row.area_id]))
  } catch {
    return new Map()
  }
}

/**
 * What each tasting can be filtered and counted by: its sake's prefecture,
 * and the grade, styles and koji of the bottling it was logged against. A
 * bottling without a sake has no prefecture; a sake without a bottling has
 * no grade.
 */
export async function lookupJournalFacts(
  entries: readonly JournalEntry[],
  expressions: readonly Expression[],
): Promise<(entry: JournalEntry) => EntryFacts> {
  const brandIds = entries.flatMap((entry) =>
    entry.event.kind === 'rating' && entry.event.brandId !== null ? [entry.event.brandId] : [],
  )
  const areas = await brandPrefectures(brandIds)
  const byId = new Map(expressions.map((expression) => [expression.id, expression]))
  return (entry) => {
    const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
    const bottling = entry.expression ? byId.get(entry.expression.id) : undefined
    return {
      areaId: brandId !== null ? (areas.get(brandId) ?? null) : null,
      grade: bottling?.grade ?? null,
      styles: bottling?.styles ?? [],
      koji: bottling?.koji ?? null,
    }
  }
}
