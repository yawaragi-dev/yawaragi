import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { MAX_FLAVOR_TAG_RESULTS, sakesTaggedWith } from '@/lib/sakenowa/flavor-tag-search'

function poolAnswering(answer: () => Promise<{ rows: unknown[] }>) {
  const query = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>(answer)
  return { query, pool: { query } as unknown as Pool }
}

const GRAPEFRUIT = [{ tagId: 109, kanji: 'グレープフルーツ' }]

describe('sakesTaggedWith', () => {
  it('lists the tagged sakes with the tag each carries, and how many there are in all', async () => {
    const { query, pool } = poolAnswering(async () => ({
      rows: [
        {
          brand_id: 12,
          name_kanji: '醸し人九平次',
          name_romaji: 'Kamoshibito Kuheiji',
          brewery_kanji: '萬乗醸造',
          brewery_romaji: 'Banjō Jōzō',
          tag_id: 109,
          tag_name: 'グレープフルーツ',
          total: '2',
        },
        {
          brand_id: 40,
          name_kanji: '而今',
          name_romaji: null,
          brewery_kanji: null,
          brewery_romaji: null,
          tag_id: 109,
          tag_name: null,
          total: '2',
        },
      ],
    }))

    const result = await sakesTaggedWith(GRAPEFRUIT, pool)

    expect(result).toEqual({
      total: 2,
      matches: [
        {
          brandId: 12,
          nameKanji: '醸し人九平次',
          nameRomaji: 'Kamoshibito Kuheiji',
          breweryKanji: '萬乗醸造',
          breweryRomaji: 'Banjō Jōzō',
          tagKanji: 'グレープフルーツ',
        },
        // No flavor_tags row to name it: the dictionary's copy of Sakenowa's spelling.
        { brandId: 40, nameKanji: '而今', nameRomaji: null, breweryKanji: null, breweryRomaji: null, tagKanji: 'グレープフルーツ' },
      ],
    })
    const [sql, params] = query.mock.calls[0]
    expect(params).toEqual([[109], MAX_FLAVOR_TAG_RESULTS])
    // A–Z, never Sakenowa's tag order or a ranking (design v1.8 M4).
    expect(sql).toMatch(/ORDER BY lower\(coalesce\(b\.name_romaji, b\.name_kanji\)\)/)
  })

  it('answers "none" while the table has not been created yet (before `pnpm migrate`)', async () => {
    const { pool } = poolAnswering(async () => {
      throw Object.assign(new Error('relation "brand_flavor_tags" does not exist'), { code: '42P01' })
    })
    expect(await sakesTaggedWith(GRAPEFRUIT, pool)).toEqual({ total: 0, matches: [] })
  })

  it('answers "none" when the table is there but empty (before `pnpm ingest`)', async () => {
    const { pool } = poolAnswering(async () => ({ rows: [] }))
    expect(await sakesTaggedWith(GRAPEFRUIT, pool)).toEqual({ total: 0, matches: [] })
  })

  it('answers "none" when the catalogue cannot be reached, so the name search still shows', async () => {
    const { pool } = poolAnswering(async () => {
      throw new Error('connect ECONNREFUSED')
    })
    expect(await sakesTaggedWith(GRAPEFRUIT, pool)).toEqual({ total: 0, matches: [] })
  })
})
