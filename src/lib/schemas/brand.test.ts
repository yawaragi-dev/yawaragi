import { describe, expect, it } from 'vitest'
import { BrandSchema, parseBrand } from './brand'

const validBrand = {
  source: 'sakenowa',
  brandId: 1,
  name: 'Reijin',
  nameKanji: '麗人',
  // `nameRomaji` defaults to null when omitted from input (see the
  // schema's `.default(null)`); including it explicitly keeps the
  // equality assertion exact since the parsed value ALWAYS carries
  // the field even when input doesn't.
  nameRomaji: null,
  breweryId: 49,
} as const

describe('Brand schema', () => {
  it('parses a valid Sakenowa-sourced brand', () => {
    expect(parseBrand(validBrand)).toEqual(validBrand)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(parseBrand({ ...validBrand, source: 'sakenowa_inferred', confidence: 0.8 })).toMatchObject({
      confidence: 0.8,
    })
  })

  it('rejects a brand without a source', () => {
    expect(() =>
      parseBrand({
        brandId: 1,
        name: 'Reijin',
        nameKanji: '麗人',
        breweryId: 49,
      }),
    ).toThrow()
  })

  it('rejects a brand with an unknown source value', () => {
    expect(() => parseBrand({ ...validBrand, source: 'mystery_provider' })).toThrow()
  })

  it('rejects sources that are valid in the wide taxonomy but illegitimate for Brand', () => {
    // ADR-0005: Brand mirrors Sakenowa data. An LLM-extracted brand, a
    // cross-beverage map row, or a "manually-curated" brand are all
    // category errors — none of these provenance kinds produce Brand rows.
    expect(() => parseBrand({ ...validBrand, source: 'llm_extracted' })).toThrow()
    expect(() => parseBrand({ ...validBrand, source: 'llm_inferred' })).toThrow()
    expect(() => parseBrand({ ...validBrand, source: 'cross_beverage_map' })).toThrow()
    expect(() => parseBrand({ ...validBrand, source: 'manual_curation' })).toThrow()
  })

  it('accepts each source within the legitimate Brand subset', () => {
    for (const source of ['sakenowa', 'sakenowa_inferred', 'user_corrected'] as const) {
      expect(parseBrand({ ...validBrand, source })).toMatchObject({ source })
    }
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
