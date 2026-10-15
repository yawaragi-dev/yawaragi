import { describe, expect, it } from 'vitest'
import type { ResolveScannedLabelResult, ScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { ListScanExtraction, ListScanLine } from '@/lib/schemas/list-scan-extraction'
import { matchList, type MatchListDeps } from './match-list'

const brand = (brandId: number, nameKanji: string, nameRomaji: string): Brand => ({
  brandId,
  name: nameRomaji,
  nameKanji,
  nameRomaji,
  breweryId: brandId,
} as Brand)
const brewery = { breweryId: 9, name: 'X', nameKanji: 'X酒造', nameRomaji: 'X Shuzo', areaId: 1 } as Brewery

const DASSAI = brand(887, '獺祭', 'Dassai')
const RIHAKU = brand(500, '李白', 'Rihaku')
const RIHAKU_SUB = brand(501, '李白 純米', 'Rihaku Junmai')

/** A catalogue with Dassai, and Rihaku listed twice. */
async function resolve(label: ScannedLabel): Promise<ResolveScannedLabelResult> {
  const query = { nameJa: label.name_ja, breweryJa: label.brewery_ja }
  if (label.name_ja === '獺祭') return { kind: 'exact', sake: DASSAI }
  if (label.name_ja === '李白') {
    return { kind: 'ambiguous', candidates: [{ sake: RIHAKU, brewery }, { sake: RIHAKU_SUB, brewery }], query }
  }
  if (label.name_ja === '赤武') {
    return { kind: 'matched_brewery_only', sake: brand(2602, 'AKABU', 'Akabu'), brewery, brandDivergence: { extracted: '赤武', stored: 'AKABU' }, query }
  }
  if (label.name_ja === '別名') {
    return { kind: 'matched_brewery_only', sake: DASSAI, brewery, brandDivergence: { extracted: '別名', stored: '獺祭' }, query }
  }
  return { kind: 'no_match', query }
}

const deps: MatchListDeps = {
  resolve,
  chartFor: async (brandId) => (brandId === 887 ? { source: 'sakenowa', brandId, f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 } : null),
  sakeHref: (brandId) => `/sake/${brandId}`,
}

const line = (over: Partial<ListScanLine> & Pick<ListScanLine, 'name_ja'>): ListScanLine => ({
  printed: over.name_ja,
  drink: 'sake',
  ...over,
})

const menu = (lines: ListScanLine[]): ListScanExtraction => ({
  source: 'llm_extracted',
  kind: 'menu',
  lines,
  unreadable_count: 0,
  confidence: 0.9,
})

describe('matching the lines of a menu to the catalogue', () => {
  it('gives each catalogue sake one row, with every line that is a bottling of it under it', async () => {
    const { rows } = await matchList(
      menu([
        line({ name_ja: '李白', printed: '李白 純米吟醸 Wandering Poet', grade: 'junmai_ginjo', price: 1100 }),
        line({ name_ja: '獺祭', price: 1200 }),
        line({ name_ja: '李白', printed: '李白 特別純米 超辛口', price: 950 }),
      ]),
      deps,
    )
    expect(rows.map((r) => r.brandId)).toEqual([500, 887])
    expect(rows[0].lines.map((l) => [l.index, l.printed, l.price])).toEqual([
      [0, '李白 純米吟醸 Wandering Poet', 1100],
      [2, '李白 特別純米 超辛口', 950],
    ])
    expect(rows[1]).toMatchObject({ nameRomaji: 'Dassai', sakeHref: '/sake/887', chart: { f1: 0.5 } })
  })

  it('lists a sake line the catalogue cannot place under "Couldn’t match", searchable by its brand', async () => {
    const { rows, unmatched } = await matchList(
      menu([line({ name_ja: '房島屋', printed: '房島屋 純米', price: 800 }), line({ name_ja: '別名' })]),
      deps,
    )
    expect(rows).toEqual([])
    expect(unmatched.map((u) => [u.printed, u.query, u.price])).toEqual([
      ['房島屋 純米', '房島屋', 800],
      ['別名', '別名', undefined],
    ])
  })

  it('takes the brewery’s sake when the line’s Latin reading is that sake’s stored name', async () => {
    const { rows } = await matchList(menu([line({ name_ja: '赤武', name_romaji: 'Akabu', brewery_ja: '赤武酒造' })]), deps)
    expect(rows.map((r) => r.brandId)).toEqual([2602])
  })

  it('keeps the lines that are not sake apart, with what they are', async () => {
    const { rows, notSake } = await matchList(
      menu([line({ name_ja: 'いいちこ', drink: 'shochu', price: 600 }), line({ name_ja: '獺祭', drink: 'unknown' })]),
      deps,
    )
    expect(notSake).toEqual([{ index: 0, printed: 'いいちこ', drink: 'shochu', price: 600 }])
    expect(rows.map((r) => r.brandId)).toEqual([887])
  })

  it('does not look up a line whose name is only a grade or style word', async () => {
    const seen: string[] = []
    const { unmatched } = await matchList(menu([line({ name_ja: 'ひやおろし' }), line({ name_ja: '大吟醸' })]), {
      ...deps,
      resolve: async (label) => {
        seen.push(label.name_ja)
        return resolve(label)
      },
    })
    expect(seen).toEqual([])
    expect(unmatched).toHaveLength(2)
  })

  it('keeps a line whose lookup failed, under "Couldn’t match", rather than losing the list', async () => {
    const { rows, unmatched } = await matchList(menu([line({ name_ja: '獺祭' }), line({ name_ja: '房島屋' })]), {
      ...deps,
      resolve: async (label) => {
        if (label.name_ja === '房島屋') throw new Error('catalogue unreachable')
        return resolve(label)
      },
    })
    expect(rows.map((r) => r.brandId)).toEqual([887])
    expect(unmatched.map((u) => u.query)).toEqual(['房島屋'])
  })

  it('looks a line up with its brand standing in for a brewery the menu does not print', async () => {
    const seen: ScannedLabel[] = []
    await matchList(menu([line({ name_ja: '獺祭', product_name: '磨き' })]), {
      ...deps,
      resolve: async (label) => {
        seen.push(label)
        return resolve(label)
      },
    })
    expect(seen[0]).toMatchObject({ name_ja: '獺祭', brewery_ja: '獺祭', other_names: ['磨き'] })
  })
})
