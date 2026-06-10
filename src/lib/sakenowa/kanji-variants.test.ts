import { describe, expect, it } from 'vitest'
import { generateKanjiVariants } from './kanji-variants'

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
  ])('produces variant pair for "%s" / "%s"', (a, b) => {
    const variantsOfA = generateKanjiVariants(a)
    const variantsOfB = generateKanjiVariants(b)
    expect(variantsOfA).toContain(a)
    expect(variantsOfA).toContain(b)
    expect(variantsOfB).toContain(a)
    expect(variantsOfB).toContain(b)
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
