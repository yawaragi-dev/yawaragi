import { describe, expect, it } from 'vitest'
import { generateKanjiVariants, isKanjiVariant } from './kanji-variants'

describe('generateKanjiVariants', () => {
  it('returns just the input verbatim for a string with no variant kanji', () => {
    expect(generateKanjiVariants('獺祭')).toEqual(['獺祭'])
  })

  it('returns the new-form variant when the input is old-form (蔵 / 藏)', () => {
    // The motivating bug: Sakenowa stores `藏王` (old form 旧字体),
    // vision model returns `蔵王` (new form 新字体). The lookup
    // needs to try both forms.
    const variants = generateKanjiVariants('蔵王')
    expect(variants).toContain('蔵王') // verbatim (new form)
    expect(variants).toContain('藏王') // old-form sibling
    expect(variants).toHaveLength(2)
  })

  it('returns the old-form variant when the input is new-form (藏 / 蔵)', () => {
    const variants = generateKanjiVariants('藏王')
    expect(variants).toContain('藏王')
    expect(variants).toContain('蔵王')
    expect(variants).toHaveLength(2)
  })

  it.each([
    ['國酒', '国酒'], // 國 ↔ 国
    ['黒龍', '黒竜'], // 龍 ↔ 竜
    ['寶剣', '宝剣'], // 寶 ↔ 宝
    ['萬寿', '万寿'], // 萬 ↔ 万 (Kubota Manju line)
    ['鐵舟', '鉄舟'], // 鐵 ↔ 鉄
    ['黒澤', '黒沢'], // 澤 ↔ 沢
    ['灣鶴', '湾鶴'], // 灣 ↔ 湾 (bay / coastal naming)
    ['出羽の譽', '出羽の誉'], // 譽 ↔ 誉
    ['恋しぐれ', '戀しぐれ'], // 恋 ↔ 戀
    ['觀音', '観音'], // 觀 ↔ 観
    ['大應', '大応'], // 應 ↔ 応
  ])('produces variant pair for "%s" / "%s"', (a, b) => {
    const variantsOfA = generateKanjiVariants(a)
    const variantsOfB = generateKanjiVariants(b)
    expect(variantsOfA).toContain(a)
    expect(variantsOfA).toContain(b)
    expect(variantsOfB).toContain(a)
    expect(variantsOfB).toContain(b)
  })

  it('expands the 濱 / 濵 / 浜 triplet (beach) in all three directions', () => {
    // Motivating bug (2026-06-14 Sekitoba scan): the vision model
    // returned `濵田酒造` for brewery 783 stored as `濱田酒造`. The
    // intermediate itaiji 濵 (U+6FF5) sits between the orthodox
    // kyūjitai 濱 (U+6FF1) and the post-1946 shinjitai 浜 (U+6D5C);
    // any direction of the triplet must reach the others or the
    // lookup misses.
    const fromKyujitai = generateKanjiVariants('濱田')
    expect(fromKyujitai).toEqual(expect.arrayContaining(['濱田', '濵田', '浜田']))
    expect(fromKyujitai).toHaveLength(3)

    const fromItaiji = generateKanjiVariants('濵田')
    expect(fromItaiji).toEqual(expect.arrayContaining(['濱田', '濵田', '浜田']))
    expect(fromItaiji).toHaveLength(3)

    const fromShinjitai = generateKanjiVariants('浜田')
    expect(fromShinjitai).toEqual(expect.arrayContaining(['濱田', '濵田', '浜田']))
    expect(fromShinjitai).toHaveLength(3)
  })

  it('treats every pair of triplet members as variants of each other', () => {
    // The exact case from the 濱田酒造 lookup miss: visitor's
    // extraction `濵田酒造` must register as a variant of the
    // catalogue's `濱田酒造`.
    expect(isKanjiVariant('濵田酒造', '濱田酒造')).toBe(true)
    expect(isKanjiVariant('濱田酒造', '浜田酒造')).toBe(true)
    expect(isKanjiVariant('濵田酒造', '浜田酒造')).toBe(true)
  })

  it('produces every per-character permutation for multi-variant strings', () => {
    // 國寶 = "national treasure" — both characters are variant pairs.
    // Per-character permutation gives 4 variants: verbatim,
    // 1st-flipped, 2nd-flipped, and both-flipped. This shape is
    // what catches Sakenowa's mixed-form storage (e.g. a brand
    // stored as 萬寿 where one character is old-form and one new).
    const variants = generateKanjiVariants('國寶')
    expect(variants).toContain('國寶') // both-old (verbatim)
    expect(variants).toContain('国寶') // 1st flipped
    expect(variants).toContain('國宝') // 2nd flipped
    expect(variants).toContain('国宝') // both-new
    expect(variants).toHaveLength(4)
  })

  it('falls back to verbatim + all-new for pathological inputs above the cap', () => {
    // 6 variant chars → 2^6 = 64 permutations, above the safety cap
    // of 16. Function returns just verbatim + all-new sibling.
    const text = '藏國龍寶萬鐵' // 6 variant chars
    const variants = generateKanjiVariants(text)
    expect(variants).toContain(text)
    expect(variants).toContain('蔵国竜宝万鉄')
    expect(variants.length).toBeLessThanOrEqual(2)
  })

  it('leaves non-Japanese characters untouched', () => {
    expect(generateKanjiVariants('Dassai 45')).toEqual(['Dassai 45'])
  })

  it('handles empty input safely', () => {
    expect(generateKanjiVariants('')).toEqual([''])
  })

  it('does not duplicate when the new-form and old-form collapse', () => {
    // 'ABC' has no variant kanji at all — both transformations
    // produce the same string as the input.
    expect(generateKanjiVariants('ABC')).toEqual(['ABC'])
    expect(generateKanjiVariants('ABC').length).toBe(1)
  })
})

describe('isKanjiVariant', () => {
  it('returns true for identical strings', () => {
    expect(isKanjiVariant('蔵王', '蔵王')).toBe(true)
  })

  it('returns true for the 旧字体 / 新字体 pair of the same brand (Zao)', () => {
    // The exact case from the matched_brand_only display issue:
    // visitor scanned `蔵王` (new form), Sakenowa stores `藏王`
    // (old form). The UI should prefer the visitor's form.
    expect(isKanjiVariant('蔵王', '藏王')).toBe(true)
    expect(isKanjiVariant('藏王', '蔵王')).toBe(true)
  })

  it('returns false for strings that are not variants of each other', () => {
    expect(isKanjiVariant('蔵王', '高清水')).toBe(false)
    expect(isKanjiVariant('斗', '高清水')).toBe(false)
  })

  it('returns false for strings that share a character but are otherwise different', () => {
    // 蔵 is in 蔵王 and in 蔵元 but the strings aren't variants of
    // each other — variant means "differ only in 旧/新 form".
    expect(isKanjiVariant('蔵王', '蔵元')).toBe(false)
  })

  it('returns true for multi-char strings where every variant character is paired', () => {
    // 國寶 / 国宝 — both characters have 旧/新 form pairs.
    expect(isKanjiVariant('國寶', '国宝')).toBe(true)
    expect(isKanjiVariant('國宝', '国寶')).toBe(true)
  })

  it('handles empty strings safely', () => {
    expect(isKanjiVariant('', '')).toBe(true)
    expect(isKanjiVariant('蔵王', '')).toBe(false)
  })
})
