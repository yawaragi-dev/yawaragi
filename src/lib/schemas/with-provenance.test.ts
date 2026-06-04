import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ProvenanceSource, WithProvenance, withProvenance } from './with-provenance'

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

describe('withProvenance factory', () => {
  // The factory is the parse-time seam that binds a record kind's source
  // field to a narrower subset of the 7-value taxonomy. These tests cover
  // the invariant directly so a regression on `withProvenance` itself
  // fails here rather than only in downstream schema tests.
  const Pinned = withProvenance(z.enum(['sakenowa', 'user_corrected']))

  it('accepts a source within the pinned subset', () => {
    expect(Pinned.parse({ source: 'sakenowa' })).toEqual({ source: 'sakenowa' })
    expect(Pinned.parse({ source: 'user_corrected' })).toEqual({ source: 'user_corrected' })
  })

  it('rejects a source outside the pinned subset, even when it is valid against the wide taxonomy', () => {
    expect(() => Pinned.parse({ source: 'llm_extracted' })).toThrow()
    expect(() => Pinned.parse({ source: 'cross_beverage_map' })).toThrow()
    expect(() => Pinned.parse({ source: 'manual_curation' })).toThrow()
  })

  it('still requires source', () => {
    expect(() => Pinned.parse({})).toThrow()
  })

  it('still accepts an optional confidence in [0,1]', () => {
    expect(Pinned.parse({ source: 'sakenowa', confidence: 0.42 })).toMatchObject({ confidence: 0.42 })
    expect(() => Pinned.parse({ source: 'sakenowa', confidence: 1.5 })).toThrow()
  })

  it('accepts a single literal source schema', () => {
    const OnlyOne = withProvenance(z.literal('manual_curation'))
    expect(OnlyOne.parse({ source: 'manual_curation' })).toEqual({ source: 'manual_curation' })
    expect(() => OnlyOne.parse({ source: 'sakenowa' })).toThrow()
  })
})
