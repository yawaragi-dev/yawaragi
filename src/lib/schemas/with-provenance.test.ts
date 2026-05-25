import { describe, expect, it } from 'vitest'
import { ProvenanceSource, WithProvenance } from './with-provenance'

describe('ProvenanceSource', () => {
  it('accepts every value in the canonical 7-source taxonomy', () => {
    const canonical = [
      'sakenowa',
      'sakenowa_inferred',
      'llm_extracted',
      'llm_inferred',
      'cross_beverage_map',
      'user_corrected',
      'manual_curation',
    ] as const
    for (const v of canonical) expect(ProvenanceSource.parse(v)).toBe(v)
  })

  it('rejects any value outside the taxonomy', () => {
    expect(() => ProvenanceSource.parse('typo_in_source')).toThrow()
    expect(() => ProvenanceSource.parse('LLM_EXTRACTED')).toThrow()
    expect(() => ProvenanceSource.parse('')).toThrow()
  })
})

describe('WithProvenance', () => {
  it('requires source', () => {
    expect(() => WithProvenance.parse({})).toThrow()
  })

  it('accepts a record without confidence', () => {
    expect(WithProvenance.parse({ source: 'sakenowa' })).toEqual({ source: 'sakenowa' })
  })

  it('accepts a record with confidence in [0,1]', () => {
    expect(WithProvenance.parse({ source: 'llm_extracted', confidence: 0.7 })).toEqual({
      source: 'llm_extracted',
      confidence: 0.7,
    })
    expect(WithProvenance.parse({ source: 'llm_extracted', confidence: 0 })).toMatchObject({ confidence: 0 })
    expect(WithProvenance.parse({ source: 'llm_extracted', confidence: 1 })).toMatchObject({ confidence: 1 })
  })

  it('rejects confidence outside [0,1]', () => {
    expect(() => WithProvenance.parse({ source: 'llm_extracted', confidence: -0.01 })).toThrow()
    expect(() => WithProvenance.parse({ source: 'llm_extracted', confidence: 1.01 })).toThrow()
  })
})
