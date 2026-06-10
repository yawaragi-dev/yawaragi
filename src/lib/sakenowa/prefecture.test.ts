import { describe, expect, it } from 'vitest'
import { PREFECTURE_COUNT, getPrefectureNames } from './prefecture'

describe('prefecture lookup', () => {
  it('covers all 47 Japanese prefectures plus the areaId 0 sentinel', () => {
    expect(PREFECTURE_COUNT).toBe(48)
  })

  it.each([
    [1, '北海道', 'Hokkaido'],
    [13, '東京都', 'Tokyo'],
    [15, '新潟県', 'Niigata'],
    [26, '京都府', 'Kyoto'],
    [27, '大阪府', 'Osaka'],
    [35, '山口県', 'Yamaguchi'], // home of 旭酒造 / Dassai
    [47, '沖縄県', 'Okinawa'],
  ])('maps areaId %i → %s / %s', (id, ja, en) => {
    const result = getPrefectureNames(id)
    expect(result).not.toBeNull()
    expect(result?.nameJa).toBe(ja)
    expect(result?.nameEn).toBe(en)
  })

  it('renders areaId 0 as "International" (the foreign-producer sentinel)', () => {
    const result = getPrefectureNames(0)
    expect(result).not.toBeNull()
    expect(result?.nameJa).toBe('その他')
    expect(result?.nameEn).toBe('International')
  })

  it('returns null for unknown ids (a future Sakenowa addition would surface here)', () => {
    expect(getPrefectureNames(48)).toBeNull()
    expect(getPrefectureNames(-1)).toBeNull()
    expect(getPrefectureNames(999)).toBeNull()
  })

  it('strips "県/府/都/道" suffixes from English names (English geography convention)', () => {
    // Spot-check the four suffix types — all should drop their suffix
    // in English. This is the rule we'd most plausibly drift from on a
    // future edit (e.g. "Tokyo-to") — locked in here.
    expect(getPrefectureNames(13)?.nameEn).toBe('Tokyo') // 東京都 → not Tokyo-to
    expect(getPrefectureNames(26)?.nameEn).toBe('Kyoto') // 京都府 → not Kyoto-fu
    expect(getPrefectureNames(15)?.nameEn).toBe('Niigata') // 新潟県 → not Niigata-ken
    expect(getPrefectureNames(1)?.nameEn).toBe('Hokkaido') // 北海道 → keeps "Hokkaido"
  })
})
