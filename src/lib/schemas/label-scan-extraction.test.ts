import { describe, expect, it } from 'vitest'
import { LabelScanExtractionSchema, parseLabelScanExtraction } from './label-scan-extraction'

const validExtraction = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
} as const

describe('LabelScanExtractionSchema', () => {
  it('parses a valid extraction', () => {
    expect(parseLabelScanExtraction(validExtraction)).toEqual(validExtraction)
  })

  it('rejects any source other than llm_extracted (PR #100 pinning pattern)', () => {
    // ADR-0005: a LabelScanExtraction can ONLY originate from a vision LLM.
    // Every other taxonomy value is a category error and must throw at parse.
    for (const source of [
      'sakenowa',
      'sakenowa_inferred',
      'llm_inferred',
      'cross_beverage_map',
      'user_corrected',
      'manual_curation',
    ] as const) {
      expect(() => parseLabelScanExtraction({ ...validExtraction, source })).toThrow()
    }
  })

  it('rejects an unknown source value entirely outside the taxonomy', () => {
    expect(() => parseLabelScanExtraction({ ...validExtraction, source: 'mystery' })).toThrow()
  })

  it('requires a confidence number (the tier resolver needs it)', () => {
    // Deliberately omit confidence — schema must reject.
    expect(() =>
      parseLabelScanExtraction({
        source: 'llm_extracted',
        name_ja: '獺祭',
        brewery_ja: '旭酒造',
      }),
    ).toThrow()
  })

  it('clamps confidence to [0,1]', () => {
    expect(() => parseLabelScanExtraction({ ...validExtraction, confidence: -0.01 })).toThrow()
    expect(() => parseLabelScanExtraction({ ...validExtraction, confidence: 1.01 })).toThrow()
  })

  it('rejects empty name_ja or brewery_ja (the lookup needs something to match against)', () => {
    expect(() => parseLabelScanExtraction({ ...validExtraction, name_ja: '' })).toThrow()
    expect(() => parseLabelScanExtraction({ ...validExtraction, brewery_ja: '' })).toThrow()
  })

  it('exposes the schema for composition', () => {
    expect(LabelScanExtractionSchema.parse(validExtraction)).toEqual(validExtraction)
  })
})
