import 'server-only'

import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import type { BottleFactsLookup } from '@/lib/collection/bottle-history-stats'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { EntryFacts } from './journal-filter'

interface BrandPlace {
  areaId: number | null
  brewery: { id: number; nameKanji: string; nameRomaji: string | null }
}

/**
 * The brewery and its prefecture for each catalogue sake in a journal, in
 * one query. An empty map when the catalogue cannot be read (CI has no
 * database): the journal still lists, the Prefecture chip just has nothing to
 * offer.
 */
export async function brandPlaces(brandIds: readonly number[]): Promise<Map<number, BrandPlace>> {
  const ids = [...new Set(brandIds)]
  if (ids.length === 0) return new Map()
  try {
    const { rows } = await publicQuery<{
      brand_id: number
      area_id: number
      brewery_id: number
      name_kanji: string
      name_romaji: string | null
    }>(
      'brands',
      `SELECT b.brand_id, br.area_id, br.brewery_id, br.name_kanji, br.name_romaji
         FROM brands b
         JOIN breweries br ON br.brewery_id = b.brewery_id
        WHERE b.brand_id = ANY($1::int[])`,
      [ids],
      getServerDbPool(),
    )
    return new Map(
      rows.map((row) => [
        row.brand_id,
        {
          // areaId 0 is Sakenowa's "Other": a brewery outside Japan's prefectures.
          areaId: row.area_id > 0 ? row.area_id : null,
          brewery: { id: row.brewery_id, nameKanji: row.name_kanji, nameRomaji: row.name_romaji },
        },
      ]),
    )
  } catch {
    return new Map()
  }
}

/**
 * What each tasting can be filtered and counted by: its sake's brewery and prefecture,
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
  const places = await brandPlaces(brandIds)
  const byId = new Map(expressions.map((expression) => [expression.id, expression]))
  return (entry) => {
    const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
    const bottling = entry.expression ? byId.get(entry.expression.id) : undefined
    const place = brandId !== null ? places.get(brandId) : undefined
    return {
      areaId: place?.areaId ?? null,
      brewery: place?.brewery ?? null,
      grade: bottling?.grade ?? null,
      styles: bottling?.styles ?? [],
      koji: bottling?.koji ?? null,
    }
  }
}

/**
 * The bottle history's facts lookup (design v1.10, AB): a bottle's prefecture
 * from its sake's brewery, its grade and styles from the visitor's own
 * bottling. One catalogue query for every sake in the history.
 */
export async function lookupBottleFacts(
  events: readonly BottleEvent[],
  expressions: readonly Expression[],
): Promise<BottleFactsLookup> {
  const places = await brandPlaces(events.flatMap((e) => (e.thing.brandId !== null ? [e.thing.brandId] : [])))
  const byId = new Map(expressions.map((expression) => [expression.id, expression]))
  return (thing) => {
    const bottling = thing.expression ? byId.get(thing.expression.id) : undefined
    return {
      areaId: thing.brandId !== null ? (places.get(thing.brandId)?.areaId ?? null) : null,
      grade: bottling?.grade ?? null,
      styles: bottling?.styles ?? [],
    }
  }
}
