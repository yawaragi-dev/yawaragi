import { describe, expect, it } from 'vitest'
import { BrewerySchema, isPlaceholderBrewery, parseBrewery, shownBreweryNames, type Brewery } from './brewery'

const validBrewery = {
  source: 'sakenowa',
  breweryId: 49,
  name: 'Reijin Shuzo',
  nameKanji: '麗人酒造',
  // See brand.test.ts for the same comment — `.default(null)` so this
  // fixture also parses cleanly if omitted, but we include it here so
  // the equality assertion is exact.
  nameRomaji: null,
  areaId: 20,
} as const

describe('Brewery schema', () => {
  it('parses a valid Sakenowa-sourced brewery', () => {
    expect(parseBrewery(validBrewery)).toEqual(validBrewery)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(
      parseBrewery({ ...validBrewery, source: 'sakenowa_inferred', confidence: 0.8 }),
    ).toMatchObject({ confidence: 0.8 })
  })

  it('rejects a brewery without a source', () => {
    expect(() =>
      parseBrewery({
        breweryId: 49,
        name: 'Reijin Shuzo',
        nameKanji: '麗人酒造',
        areaId: 20,
      }),
    ).toThrow()
  })

  it('rejects a brewery with an unknown source value', () => {
    expect(() => parseBrewery({ ...validBrewery, source: 'mystery_provider' })).toThrow()
  })

  it('rejects sources that are valid in the wide taxonomy but illegitimate for Brewery', () => {
    expect(() => parseBrewery({ ...validBrewery, source: 'llm_extracted' })).toThrow()
    expect(() => parseBrewery({ ...validBrewery, source: 'llm_inferred' })).toThrow()
    expect(() => parseBrewery({ ...validBrewery, source: 'cross_beverage_map' })).toThrow()
    expect(() => parseBrewery({ ...validBrewery, source: 'manual_curation' })).toThrow()
  })

  it('accepts each source within the legitimate Brewery subset', () => {
    for (const source of ['sakenowa', 'sakenowa_inferred', 'user_corrected'] as const) {
      expect(parseBrewery({ ...validBrewery, source })).toMatchObject({ source })
    }
  })

  it('rejects a non-positive breweryId', () => {
    expect(() => parseBrewery({ ...validBrewery, breweryId: 0 })).toThrow()
    expect(() => parseBrewery({ ...validBrewery, breweryId: -1 })).toThrow()
  })

  it('rejects a negative areaId but accepts areaId 0 (Sakenowa foreign producer marker)', () => {
    expect(() => parseBrewery({ ...validBrewery, areaId: -1 })).toThrow()
    expect(parseBrewery({ ...validBrewery, areaId: 0 })).toMatchObject({ areaId: 0 })
  })

  it('accepts empty name + nameKanji (Sakenowa placeholder rows for "brewery unknown within prefecture")', () => {
    const placeholder = parseBrewery({ ...validBrewery, name: '', nameKanji: '' })
    expect(placeholder.name).toBe('')
    expect(placeholder.nameKanji).toBe('')
  })

  it('exposes BrewerySchema for composition', () => {
    expect(BrewerySchema.parse(validBrewery)).toEqual(validBrewery)
  })
})

describe('isPlaceholderBrewery', () => {
  // Sakenowa's "maker not on record" row for Hokkaidō (#419).
  const hokkaidoPlaceholder: Brewery = {
    source: 'sakenowa',
    breweryId: 784,
    name: '',
    nameKanji: '',
    nameRomaji: null,
    areaId: 1,
  }

  it("recognises Sakenowa's per-prefecture placeholder, which has an area and no name", () => {
    expect(isPlaceholderBrewery(hokkaidoPlaceholder)).toBe(true)
  })

  it('recognises the "other" placeholder outside the prefectures too', () => {
    const other: Brewery = { ...hokkaidoPlaceholder, breweryId: 1147, areaId: 0 }
    expect(isPlaceholderBrewery(other)).toBe(true)
  })

  it('treats a name of only spaces as no name', () => {
    expect(isPlaceholderBrewery({ nameKanji: ' 　' })).toBe(true)
  })

  it('does not mistake a named brewery for a placeholder', () => {
    const niseko: Brewery = { ...hokkaidoPlaceholder, breweryId: 923, name: '二世古酒造', nameKanji: '二世古酒造' }
    expect(isPlaceholderBrewery(niseko)).toBe(false)
  })
})

describe('shownBreweryNames', () => {
  it("keeps a real brewery's names for a list row", () => {
    expect(shownBreweryNames('旭酒造', 'Asahi Shuzo')).toEqual({ breweryKanji: '旭酒造', breweryRomaji: 'Asahi Shuzo' })
  })

  it('names no brewery for a sake filed under a placeholder, so the row shows its prefecture alone', () => {
    expect(shownBreweryNames('', null)).toEqual({ breweryKanji: null, breweryRomaji: null })
  })

  it('names no brewery where the catalogue has none for the sake', () => {
    expect(shownBreweryNames(null, null)).toEqual({ breweryKanji: null, breweryRomaji: null })
  })
})
