import { describe, expect, it } from 'vitest'
import {
  breweryKanjiAgrees,
  expandLatinBrandVariants,
  latinBreweryAgrees,
  namesOverlapping,
} from './lookup'

/**
 * Pure-function unit tests for the Latin variant expansion used by the
 * fifth-pass Sakenowa lookup. The lookup chain as a whole is exercised
 * end-to-end against testcontainers in `lookup.integration.test.ts`;
 * these tests pin the per-input transform contract so a regression in
 * the variant set is caught fast without spinning Postgres.
 */
describe('expandLatinBrandVariants', () => {
  it('returns an empty list for empty / whitespace-only input', () => {
    expect(expandLatinBrandVariants('')).toEqual([])
    expect(expandLatinBrandVariants('   ')).toEqual([])
  })

  it('lowercases the verbatim input', () => {
    expect(expandLatinBrandVariants('UMAMI')).toEqual(['umami'])
  })

  it('strips the first word as a second variant for multi-word brands (≥ 4-char floor)', () => {
    // "Kizakura Perle" → also try "Kizakura" alone. The Perle is a
    // sub-line modifier the catalogue does not track separately.
    expect(expandLatinBrandVariants('Kizakura Perle')).toEqual(
      expect.arrayContaining(['kizakura perle', 'kizakura']),
    )
  })

  it('tries the leading words of a longer label name: "SAWA NO HANA Kokoro" → "sawa no hana"', () => {
    // A real scan (2026-10-09): the model read the label's Latin as one name,
    // the line is 澤の花 "Sawa no Hana", and only "Kokoro" — the product —
    // stood in the way. "sawa" alone is not the line.
    expect(expandLatinBrandVariants('SAWA NO HANA Kokoro')).toEqual(
      expect.arrayContaining(['sawa no hana kokoro', 'sawa no hana', 'sawanohana']),
    )
  })

  it('reads a hyphen as a word break: "DARUMA-MASAMUNE" also tries "daruma masamune" and "darumamasamune"', () => {
    // Labels hyphenate their Latin (DARUMA-MASAMUNE, NINKI-ICHI); the
    // catalogue's romaji is written as words or run together.
    expect(expandLatinBrandVariants('DARUMA-MASAMUNE')).toEqual(
      expect.arrayContaining(['daruma-masamune', 'daruma masamune', 'darumamasamune']),
    )
  })

  it('drops grade words wherever they sit before taking the leading words', () => {
    expect(expandLatinBrandVariants('Yamagata Masamune Junmai Ginjo Omachi')).toEqual(
      expect.arrayContaining(['yamagata masamune']),
    )
  })

  it('skips the first-word-strip when the first word is shorter than 4 chars', () => {
    // 4-char floor prevents `"Big River" → "Big"` from polluting candidates.
    const out = expandLatinBrandVariants('Big River')
    expect(out).not.toContain('big')
    expect(out).toContain('big river')
  })

  it('adds a space-stripped variant when input contains a space', () => {
    // The #121 ingest pipeline writes single-word camel Latin to
    // `name_romaji` ("Tanigawadake", "Kawatsuru"), so a natural
    // "Tanigawa Dake" extraction must squash to match.
    expect(expandLatinBrandVariants('Tanigawa Dake')).toEqual(
      expect.arrayContaining(['tanigawa dake', 'tanigawa', 'tanigawadake']),
    )
  })

  it('does not duplicate the space-stripped form when input has no space', () => {
    // Already-spaceless input is covered by the verbatim variant alone.
    expect(expandLatinBrandVariants('Tanigawadake')).toEqual(['tanigawadake'])
  })

  // Grade-token blocklist regression coverage. The blocklist is the
  // load-bearing defence against Haiku returning a sake descriptor
  // (`"JUNMAI TARU SAKE"`) as the brand and the bare descriptor
  // first-word-strip matching an unrelated Sakenowa brand whose Latin
  // name happens to start with that descriptor (Kiku-Masamune,
  // 2026-06-14). See SAKE_GRADE_TOKENS in lookup.ts for the full list.

  it('suppresses the first-word-strip when the first word is a sake grade token (junmai)', () => {
    const out = expandLatinBrandVariants('JUNMAI TARU SAKE')
    expect(out).not.toContain('junmai')
    expect(out).toContain('junmai taru sake')
    expect(out).toContain('junmaitarusake')
  })

  it('suppresses the first-word-strip for daiginjo / ginjo / honjozo / kimoto / yamahai / taru', () => {
    // Sample across the blocklist to catch accidental token removal.
    expect(expandLatinBrandVariants('Daiginjo Premium')).not.toContain('daiginjo')
    expect(expandLatinBrandVariants('Ginjo Style')).not.toContain('ginjo')
    expect(expandLatinBrandVariants('Honjozo Classic')).not.toContain('honjozo')
    expect(expandLatinBrandVariants('Kimoto Aged')).not.toContain('kimoto')
    expect(expandLatinBrandVariants('Yamahai Junmai')).not.toContain('yamahai')
    expect(expandLatinBrandVariants('Taru Sake')).not.toContain('taru')
  })

  it('still strips non-blocklist first words even when later words look like descriptors', () => {
    // "Kizakura Junmai" — `Junmai` is in the middle, not the first
    // word. The first-word `Kizakura` must still be added as a variant
    // (the blocklist only inspects position 0).
    const out = expandLatinBrandVariants('Kizakura Junmai')
    expect(out).toContain('kizakura')
  })

  it('is case-insensitive on the blocklist check', () => {
    // Same `junmai` filter must fire whether the model returns
    // upper-, lower-, or mixed-case.
    expect(expandLatinBrandVariants('junmai Taru Sake')).not.toContain('junmai')
    expect(expandLatinBrandVariants('Junmai Taru Sake')).not.toContain('junmai')
    expect(expandLatinBrandVariants('JuNmAi Taru Sake')).not.toContain('junmai')
  })

  it('emits all three forms for a normal multi-word brand (verbatim, first-word, space-stripped)', () => {
    // Sanity check that the three transforms compose for a non-grade
    // input. Order is not asserted (Set-backed); presence is.
    const out = expandLatinBrandVariants('Kizakura Perle')
    expect(new Set(out)).toEqual(new Set(['kizakura perle', 'kizakura', 'kizakuraperle']))
  })
})

describe('latinBreweryAgrees', () => {
  it("matches a back label's brewery with the catalogue's romaji whatever each calls a brewery", () => {
    expect(latinBreweryAgrees('Rihaku Sake Brewery', 'Rihaku Shuzo')).toBe(true)
    expect(latinBreweryAgrees('Miyoshino Sake Brewery Co.,Ltd', 'Miyoshino Jozo')).toBe(true)
    expect(latinBreweryAgrees('Kobe Shushinkan', 'Kobe Shushinkan')).toBe(true)
  })

  it('matches when the label gives only part of the name: "Shiraki Brewery" is Shiraki Tsunesuke Shoten', () => {
    expect(latinBreweryAgrees('Shiraki Brewery', 'Shiraki Tsunesuke Shoten')).toBe(true)
  })

  it('does not match an importer, a country or a different brewery', () => {
    expect(latinBreweryAgrees('Ginza Berlin', 'Kiyosu Sakura Jozo')).toBe(false)
    expect(latinBreweryAgrees('Hergestellt in Japan', 'Choryo Shuzo')).toBe(false)
    expect(latinBreweryAgrees('Sanwa Shuzo', 'Miwa Shuzo')).toBe(false)
  })

  it('does not match on generic words alone, or against a brewery with no romaji', () => {
    expect(latinBreweryAgrees('Sake Brewery Co., Ltd.', 'Rihaku Shuzo')).toBe(false)
    expect(latinBreweryAgrees('Rihaku Sake Brewery', null)).toBe(false)
  })
})

describe('namesOverlapping', () => {
  const CHORYO_LINES = ['九々鱗', '稲の国の稲の酒', '長龍', '吉野杉の樽酒', '四季咲']

  it('finds the one line a partial read belongs to: 樽酒 is 吉野杉の樽酒', () => {
    expect(namesOverlapping('樽酒', CHORYO_LINES)).toEqual([3])
  })

  it('finds a line the read contains, product name and all: 瑞鷹 熊本城 holds 瑞鷹', () => {
    expect(namesOverlapping('瑞鷹 熊本城', ['瑞鷹', '春酒', '華しずく'])).toEqual([0])
  })

  it('finds nothing for a read that is part of no line, or of one character', () => {
    expect(namesOverlapping('濃姫の里', ['鬼ころし', '清須'])).toEqual([])
    expect(namesOverlapping('雪', ['雪の十和田', '北秋田'])).toEqual([])
  })

  it('returns every line that fits, leaving the caller to see it is not one', () => {
    expect(namesOverlapping('正宗', ['達磨正宗', 'ダルマ正宗', '淡墨桜'])).toEqual([0, 1])
  })
})

describe('breweryKanjiAgrees', () => {
  it('matches the stored name as written, without its space, or by one of its parts', () => {
    expect(breweryKanjiAgrees('白木恒助商店', ['白木恒助商店'])).toBe(true)
    expect(breweryKanjiAgrees('仙台伊澤家 勝山酒造', ['仙台伊澤家勝山酒造'])).toBe(true)
    expect(breweryKanjiAgrees('仙台伊澤家 勝山酒造', ['勝山酒造'])).toBe(true)
  })

  it('does not match another brewery', () => {
    expect(breweryKanjiAgrees('白木恒助商店', ['三輪酒造'])).toBe(false)
  })
})
