import { describe, expect, it } from 'vitest'
import {
  expandBrandVariants,
  expandBreweryVariants,
  expandPossibleBrandVariants,
  stripOperationalSuffix,
} from './brewery-variants'

describe('expandBreweryVariants', () => {
  it('returns just the verbatim form when the input already ends with 酒造', () => {
    const variants = expandBreweryVariants('高清水酒造')
    expect(variants).toEqual(['高清水酒造'])
  })

  it('returns the verbatim form (plus its kanji-variant sibling) for an input ending in 醸造', () => {
    // 醸 has the 旧字体 sibling 釀 — the kanji-variant expansion adds
    // the old-form sibling unconditionally. Suffix-expansion stays
    // suppressed because the input already ends in an operational
    // suffix, so we get the verbatim + its variant pair, not the full
    // suffix Cartesian.
    const variants = expandBreweryVariants('八海醸造')
    expect(variants).toContain('八海醸造')
    expect(variants).toContain('八海釀造')
    expect(variants).toHaveLength(2)
  })

  it('returns just the verbatim form for an input ending in 酒造店', () => {
    expect(expandBreweryVariants('齋彌酒造店')).toEqual(['齋彌酒造店'])
  })

  it('returns just the verbatim form for an input ending in 酒造場', () => {
    expect(expandBreweryVariants('鈴木酒造場')).toEqual(['鈴木酒造場'])
  })

  it('appends each operational suffix when the input has no suffix', () => {
    // Motivating real-world case: model dropped the 酒造 suffix on a
    // Takashimizu bottle and the brewery-only lookup missed because
    // Sakenowa stores 高清水酒造.
    const variants = expandBreweryVariants('高清水')
    expect(variants).toContain('高清水')
    expect(variants).toContain('高清水酒造')
    expect(variants).toContain('高清水醸造')
    expect(variants).toContain('高清水酒造店')
    expect(variants).toContain('高清水酒造場')
  })

  it('correctly distinguishes longer suffixes from their prefixes', () => {
    // 酒造店 ends with 造 then 店, NOT with the shorter 酒造 — make
    // sure the longest-first ordering of OPERATIONAL_SUFFIXES
    // prevents `endsWith('酒造')` from short-circuiting on the
    // shorter form when the longer is what's actually present.
    expect(expandBreweryVariants('齋彌酒造店')).toEqual(['齋彌酒造店'])
    expect(expandBreweryVariants('鈴木酒造場')).toEqual(['鈴木酒造場'])
  })

  it('composes with kanji-variant expansion (旧字体 / 新字体)', () => {
    // 釀 ↔ 醸 is a 旧/新 form pair the variant expander knows.
    // Applied to the suffix `醸造`, the expansion produces both
    // `釀造` and `醸造` candidates.
    const variants = expandBreweryVariants('八海')
    expect(variants).toContain('八海')
    expect(variants).toContain('八海醸造')
    expect(variants).toContain('八海釀造')
  })

  it('does not duplicate when the kanji-variant expansion collapses', () => {
    // 高 / 清 / 水 have no 旧/新 form siblings, so each suffix
    // candidate produces exactly one kanji variant — the resulting
    // set has no duplicates.
    const variants = expandBreweryVariants('高清水')
    expect(variants.length).toBe(new Set(variants).size)
  })

  it('handles empty input safely', () => {
    expect(expandBreweryVariants('')).toEqual([''])
  })
})

describe('stripOperationalSuffix', () => {
  it('strips 酒造 from the end', () => {
    expect(stripOperationalSuffix('高清水酒造')).toBe('高清水')
  })

  it('strips 醸造 from the end', () => {
    expect(stripOperationalSuffix('八海醸造')).toBe('八海')
  })

  it('strips the longer 酒造店 before short-circuiting on 酒造', () => {
    expect(stripOperationalSuffix('齋彌酒造店')).toBe('齋彌')
  })

  it('strips 酒造場 cleanly', () => {
    expect(stripOperationalSuffix('鈴木酒造場')).toBe('鈴木')
  })

  it('returns null when no operational suffix is present', () => {
    expect(stripOperationalSuffix('高清水')).toBeNull()
    expect(stripOperationalSuffix('獺祭')).toBeNull()
    expect(stripOperationalSuffix('Dassai')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(stripOperationalSuffix('')).toBeNull()
  })
})

describe('expandPossibleBrandVariants', () => {
  it('returns just the verbatim form when the input has no operational suffix', () => {
    expect(expandPossibleBrandVariants('高清水')).toEqual(['高清水'])
    expect(expandPossibleBrandVariants('獺祭')).toEqual(['獺祭'])
  })

  it('adds the stem when the input has an operational suffix (2026-06-11 Takashimizu field-swap)', () => {
    // Motivating real-world case: scan-action's field-swap rescue
    // is handed `extraction.brewery_ja = "高清水酒造"`. The brand
    // exists in Sakenowa as `高清水` (no suffix). Without stem
    // expansion the rescue misses; with it the lookup finds the
    // canonical brand row.
    const variants = expandPossibleBrandVariants('高清水酒造')
    expect(variants).toContain('高清水酒造')
    expect(variants).toContain('高清水')
  })

  it('composes with kanji-variant expansion on both the verbatim form and the stem', () => {
    // 醸 ↔ 釀 is a 旧/新 form pair. Applied to `八海醸造`:
    //   baseForms = ['八海醸造', '八海']
    //   variant expansion adds 八海釀造 (only the 醸造 form has a
    //   variant char; 八海 has none)
    const variants = expandPossibleBrandVariants('八海醸造')
    expect(variants).toContain('八海醸造')
    expect(variants).toContain('八海')
    expect(variants).toContain('八海釀造')
    expect(variants).toHaveLength(3)
  })

  it('adds the hiragana ↔ katakana cross for kana brand inputs (2026-06-12 script-coverage fix)', () => {
    // Sakenowa has 169 pure-hiragana brands and 35 pure-katakana
    // brands. If the model returns one kana form and the catalogue
    // stores the other, kana-cross expansion bridges the gap.
    const variants = expandPossibleBrandVariants('うまみ')
    expect(variants).toContain('うまみ')
    expect(variants).toContain('ウマミ')
  })

  it('handles empty input safely', () => {
    expect(expandPossibleBrandVariants('')).toEqual([''])
  })
})

describe('expandBrandVariants', () => {
  it('returns the verbatim form for a clean kanji brand', () => {
    expect(expandBrandVariants('獺祭')).toEqual(['獺祭'])
  })

  it('does NOT strip operational suffix (that is `expandPossibleBrandVariants`)', () => {
    // First-pass uses `expandBrandVariants` and shouldn't add a
    // suffix-stripped sibling — the brand isn't supposed to carry
    // operational suffixes there. Only the field-swap path
    // (`expandPossibleBrandVariants`) does the strip.
    expect(expandBrandVariants('高清水酒造')).toEqual(['高清水酒造'])
  })

  it('still composes kanji-variant expansion (旧字体 / 新字体)', () => {
    // Variant kanji from generateKanjiVariants still applies — 蔵王
    // gets paired with 藏王 for the variant-form match.
    const variants = expandBrandVariants('蔵王')
    expect(variants).toContain('蔵王')
    expect(variants).toContain('藏王')
  })

  it('composes kana-cross expansion', () => {
    const variants = expandBrandVariants('うまみ')
    expect(variants).toContain('うまみ')
    expect(variants).toContain('ウマミ')
  })

  it('handles empty input safely', () => {
    expect(expandBrandVariants('')).toEqual([''])
  })
})
