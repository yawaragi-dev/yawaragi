import { describe, expect, it } from 'vitest'
import { BrewerySchema, isPlaceholderBrewery, parseBrewery, type Brewery } from './brewery'

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
  const base: Brewery = {
    source: 'sakenowa',
    breweryId: 785,
    name: '',
    nameKanji: '',
    nameRomaji: null,
    areaId: 2,
  }

  it('returns true for Sakenowa placeholder rows (empty name)', () => {
    expect(isPlaceholderBrewery(base)).toBe(true)
  })

  it('returns false for fully-named breweries', () => {
    expect(isPlaceholderBrewery({ ...base, name: '麗人酒造', nameKanji: '麗人酒造' })).toBe(false)
  })

  it('returns true regardless of areaId (placeholders cover both Japanese + foreign)', () => {
    expect(isPlaceholderBrewery({ ...base, areaId: 0 })).toBe(true)
  })
})
