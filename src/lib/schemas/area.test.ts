import { describe, expect, it } from 'vitest'
import { AreaSchema, parseArea } from './area'

const validArea = {
  source: 'sakenowa',
  areaId: 20,
  name: '長野県',
} as const

describe('Area schema', () => {
  it('parses a valid Sakenowa-sourced area', () => {
    expect(parseArea(validArea)).toEqual(validArea)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(parseArea({ ...validArea, source: 'manual_curation', confidence: 1 })).toMatchObject({
      confidence: 1,
    })
  })

  it('rejects an area without a source', () => {
    expect(() => parseArea({ areaId: 20, name: '長野県' })).toThrow()
  })

  it('rejects an area with an unknown source value', () => {
    expect(() => parseArea({ ...validArea, source: 'mystery_provider' })).toThrow()
  })

  it('rejects sources that are valid in the wide taxonomy but illegitimate for Area', () => {
    // Area legitimately accepts `manual_curation` (areaId 0 sentinel for
    // foreign producers — see schema comment + CONTEXT.md). LLM kinds
    // and the cross-beverage map remain category errors.
    expect(() => parseArea({ ...validArea, source: 'llm_extracted' })).toThrow()
    expect(() => parseArea({ ...validArea, source: 'llm_inferred' })).toThrow()
    expect(() => parseArea({ ...validArea, source: 'cross_beverage_map' })).toThrow()
  })

  it('accepts each source within the legitimate Area subset', () => {
    for (const source of [
      'sakenowa',
      'sakenowa_inferred',
      'user_corrected',
      'manual_curation',
    ] as const) {
      expect(parseArea({ ...validArea, source })).toMatchObject({ source })
    }
  })

  it('accepts areaId 0 (Sakenowa foreign-producer sentinel) and rejects negatives', () => {
    expect(parseArea({ ...validArea, areaId: 0 })).toMatchObject({ areaId: 0 })
    expect(() => parseArea({ ...validArea, areaId: -1 })).toThrow()
  })

  it('rejects non-integer areaId', () => {
    expect(() => parseArea({ ...validArea, areaId: 1.5 })).toThrow()
  })

  it('rejects empty name', () => {
    expect(() => parseArea({ ...validArea, name: '' })).toThrow()
  })

  it('exposes AreaSchema for composition', () => {
    expect(AreaSchema.parse(validArea)).toEqual(validArea)
  })
})
