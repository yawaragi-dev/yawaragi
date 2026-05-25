import { describe, expect, it } from 'vitest'
import { BrandSchema, parseBrand } from './brand'

const validBrand = {
  source: 'sakenowa',
  brandId: 1,
  name: 'Reijin',
  nameKanji: '麗人',
  breweryId: 49,
} as const

describe('Brand schema', () => {
  it('parses a valid Sakenowa-sourced brand', () => {
    expect(parseBrand(validBrand)).toEqual(validBrand)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(parseBrand({ ...validBrand, source: 'llm_extracted', confidence: 0.8 })).toMatchObject({
      confidence: 0.8,
    })
  })

  it('rejects a brand without a source', () => {
    const { source: _omitted, ...withoutSource } = validBrand
    expect(() => parseBrand(withoutSource)).toThrow()
  })

  it('rejects a brand with an unknown source value', () => {
    expect(() => parseBrand({ ...validBrand, source: 'mystery_provider' })).toThrow()
  })

  it('rejects a non-positive brandId', () => {
    expect(() => parseBrand({ ...validBrand, brandId: 0 })).toThrow()
    expect(() => parseBrand({ ...validBrand, brandId: -1 })).toThrow()
  })

  it('rejects non-integer brandId', () => {
    expect(() => parseBrand({ ...validBrand, brandId: 1.5 })).toThrow()
  })

  it('rejects empty name or nameKanji', () => {
    expect(() => parseBrand({ ...validBrand, name: '' })).toThrow()
    expect(() => parseBrand({ ...validBrand, nameKanji: '' })).toThrow()
  })

  it('exposes BrandSchema for composition', () => {
    expect(BrandSchema.parse(validBrand)).toEqual(validBrand)
  })
})
