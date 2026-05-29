import { describe, expect, it } from 'vitest'
import { BrewerySchema, parseBrewery } from './brewery'

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

  it('rejects a non-positive areaId', () => {
    expect(() => parseBrewery({ ...validBrewery, areaId: 0 })).toThrow()
  })

  it('rejects empty name or nameKanji', () => {
    expect(() => parseBrewery({ ...validBrewery, name: '' })).toThrow()
    expect(() => parseBrewery({ ...validBrewery, nameKanji: '' })).toThrow()
  })

  it('exposes BrewerySchema for composition', () => {
    expect(BrewerySchema.parse(validBrewery)).toEqual(validBrewery)
  })
})
