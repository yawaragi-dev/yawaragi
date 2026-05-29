import { describe, expect, it } from 'vitest'
import { BrewerySchema, isPlaceholderBrewery, parseBrewery, type Brewery } from './brewery'

const validBrewery = {
  source: 'sakenowa',
  breweryId: 49,
  name: 'Reijin Shuzo',
  nameKanji: '麗人酒造',
  areaId: 20,
} as const

describe('Brewery schema', () => {
  it('parses a valid Sakenowa-sourced brewery', () => {
    expect(parseBrewery(validBrewery)).toEqual(validBrewery)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(
      parseBrewery({ ...validBrewery, source: 'llm_extracted', confidence: 0.8 }),
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
