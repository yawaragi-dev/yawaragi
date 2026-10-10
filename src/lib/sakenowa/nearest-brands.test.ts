import { describe, expect, it } from 'vitest'
import { rankNearestBrands, type NearestBrandRow } from '@/lib/sakenowa/nearest-brands'

const row = (
  brandId: number,
  nameKanji: string,
  breweryKanji: string | null,
  nameRomaji: string | null = null,
): NearestBrandRow => ({ brandId, nameKanji, nameRomaji, breweryKanji, breweryRomaji: null, areaId: null })

const CATALOGUE = [
  row(1, '獺祭', '旭酒造', 'Dassai'),
  row(2, '十四代', '高木酒造', 'Juyondai'),
  row(3, '鍋島', '富久千代酒造', 'Nabeshima'),
  row(4, '東洋美人', '澄川酒造場', 'Toyo Bijin'),
  row(5, '伯楽星', '新澤醸造店'),
  row(6, '愛宕の松', '新澤醸造店'),
]

describe('rankNearestBrands', () => {
  it('offers the sake whose name is close to what was read', () => {
    const picks = rankNearestBrands({ name: '獺祭磨', brewery: '架空酒造' }, CATALOGUE)
    expect(picks.map((p) => p.row.brandId)).toEqual([1])
    expect(picks[0].reason).toBe('name')
  })

  it('offers the sakes of a brewery whose name is close, when the sake name is not', () => {
    const picks = rankNearestBrands({ name: '架空銘柄', brewery: '新沢醸造' }, CATALOGUE)
    expect(picks.map((p) => p.row.brandId).sort()).toEqual([5, 6])
    expect(picks.every((p) => p.reason === 'brewery')).toBe(true)
  })

  it('says so when both the name and the brewery are close', () => {
    const [pick] = rankNearestBrands({ name: '東洋美', brewery: '澄川酒造' }, CATALOGUE)
    expect(pick.row.brandId).toBe(4)
    expect(pick.reason).toBe('both')
  })

  it('ignores the grade and polishing words a label adds to the name', () => {
    const [pick] = rankNearestBrands({ name: '鍋島 純米吟醸 50', brewery: '架空酒造' }, CATALOGUE)
    expect(pick?.row.brandId).toBe(3)
  })

  it('reads a Latin name against the romaji', () => {
    const [pick] = rankNearestBrands({ name: 'Juyondaii', brewery: '架空' }, CATALOGUE)
    expect(pick?.row.brandId).toBe(2)
  })

  it('does not count the shared 酒造 ending as a similar brewery', () => {
    expect(rankNearestBrands({ name: '架空銘柄', brewery: '架空酒造' }, CATALOGUE)).toEqual([])
  })

  it('drops a faint brewery likeness once another brewery reads almost exactly', () => {
    const catalogue = [row(10, '鍋島', '富久千代酒造'), row(11, '千代', '千代酒造')]
    const picks = rankNearestBrands({ name: '架空銘柄', brewery: '富久千代' }, catalogue)
    expect(picks.map((p) => p.row.brandId)).toEqual([10])
  })

  it('offers at most three', () => {
    const many = Array.from({ length: 6 }, (_, i) => row(100 + i, `山田${i}`, '山田酒造'))
    expect(rankNearestBrands({ name: '架空銘柄', brewery: '山田酒' }, many)).toHaveLength(3)
  })
})
