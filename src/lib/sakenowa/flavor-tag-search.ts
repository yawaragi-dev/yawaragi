import 'server-only'

import type { Pool, PoolClient } from 'pg'
import { getServerDbPool } from '@/lib/supabase/server-client'
import { publicQuery } from '@/lib/supabase/public-query'
import type { CatalogueSearchResult } from '@/lib/sakenowa/search-brands'

/** A–Z and possibly long (甘味 sits on ~1,400 sakes); past this many it says "first". */
export const MAX_FLAVOR_TAG_RESULTS = 200

export interface FlavorTaggedSake extends CatalogueSearchResult {
  /** The Sakenowa tag this sake carries, as Sakenowa spells it: "Tagged グレープフルーツ". */
  readonly tagKanji: string
}

export interface FlavorTaggedSakes {
  /** How many sakes carry the tag(s) in all; `matches` stops at the cap. */
  readonly total: number
  readonly matches: readonly FlavorTaggedSake[]
}

interface Row {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  brewery_kanji: string | null
  brewery_romaji: string | null
  tag_id: number
  tag_name: string | null
  total: string | number
}

const NONE: FlavorTaggedSakes = { total: 0, matches: [] }

/**
 * §8's flavor word (design v1.8 M3, #451): the catalogue's sakes Sakenowa
 * drinkers tagged with any of `tags`, A–Z (M4: no popularity order, and not
 * Sakenowa's tag order either). A sake with several of the tags is listed once,
 * under the first of them in `tags`.
 *
 * Never throws, and answers "none" whenever it cannot answer: before
 * `pnpm migrate` has created `brand_flavor_tags` (migration 0020), before
 * `pnpm ingest` has filled it, without a DATABASE_URL (CI's e2e) or with the
 * mirror out of reach. Search then shows its name results as before.
 */
export async function sakesTaggedWith(
  tags: readonly { readonly tagId: number; readonly kanji: string }[],
  executor?: Pool | PoolClient,
): Promise<FlavorTaggedSakes> {
  if (tags.length === 0) return NONE
  const tagIds = tags.map((t) => t.tagId)
  try {
    const { rows } = await publicQuery<Row>(
      'brand_flavor_tags',
      `SELECT b.brand_id, b.name_kanji, b.name_romaji,
              br.name_kanji AS brewery_kanji, br.name_romaji AS brewery_romaji,
              t.tag_id, ft.name AS tag_name,
              count(*) OVER () AS total
         FROM (SELECT DISTINCT ON (brand_id) brand_id, tag_id
                 FROM brand_flavor_tags
                WHERE tag_id = ANY($1::int[])
                ORDER BY brand_id, array_position($1::int[], tag_id)) t
         JOIN brands b ON b.brand_id = t.brand_id AND b.superseded_at IS NULL
         LEFT JOIN breweries br ON br.brewery_id = b.brewery_id AND br.superseded_at IS NULL
         LEFT JOIN flavor_tags ft ON ft.tag_id = t.tag_id
        ORDER BY lower(coalesce(b.name_romaji, b.name_kanji)), b.brand_id
        LIMIT $2`,
      [tagIds, MAX_FLAVOR_TAG_RESULTS],
      executor ?? getServerDbPool(),
    )
    if (rows.length === 0) return NONE
    const kanjiById = new Map(tags.map((t) => [t.tagId, t.kanji]))
    return {
      total: Number(rows[0].total),
      matches: rows.map((row) => ({
        brandId: row.brand_id,
        nameKanji: row.name_kanji,
        nameRomaji: row.name_romaji,
        breweryKanji: row.brewery_kanji,
        breweryRomaji: row.brewery_romaji,
        tagKanji: row.tag_name ?? kanjiById.get(row.tag_id) ?? '',
      })),
    }
  } catch {
    return NONE
  }
}
