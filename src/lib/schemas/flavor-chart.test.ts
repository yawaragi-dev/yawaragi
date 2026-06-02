import { describe, expect, it } from 'vitest'
import {
  FLAVOR_AXES,
  FLAVOR_AXIS_ROMAJI,
  FlavorChartSchema,
  parseFlavorChart,
  type FlavorAxis,
} from './flavor-chart'

const validFlavorChart = {
  source: 'sakenowa',
  brandId: 2,
  f1: 0.27,
  f2: 0.51,
  f3: 0.31,
  f4: 0.42,
  f5: 0.46,
  f6: 0.42,
} as const

describe('FlavorChart schema', () => {
  it('parses a valid Sakenowa-sourced flavor chart', () => {
    expect(parseFlavorChart(validFlavorChart)).toEqual(validFlavorChart)
  })

  it('accepts the axis extremes (0 and 1)', () => {
    expect(
      parseFlavorChart({ ...validFlavorChart, f1: 0, f2: 1 }),
    ).toMatchObject({ f1: 0, f2: 1 })
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(
      parseFlavorChart({ ...validFlavorChart, source: 'sakenowa_inferred', confidence: 0.9 }),
    ).toMatchObject({ confidence: 0.9 })
  })

  it('rejects sources that are valid in the wide taxonomy but illegitimate for FlavorChart', () => {
    // ADR-0005: a FlavorChart is Sakenowa-mirrored. LLM extraction /
    // inference and the cross-beverage map cannot produce one.
    expect(() => parseFlavorChart({ ...validFlavorChart, source: 'llm_extracted' })).toThrow()
    expect(() => parseFlavorChart({ ...validFlavorChart, source: 'llm_inferred' })).toThrow()
    expect(() => parseFlavorChart({ ...validFlavorChart, source: 'cross_beverage_map' })).toThrow()
    expect(() => parseFlavorChart({ ...validFlavorChart, source: 'manual_curation' })).toThrow()
  })

  it('accepts each source within the legitimate FlavorChart subset', () => {
    for (const source of ['sakenowa', 'sakenowa_inferred', 'user_corrected'] as const) {
      expect(parseFlavorChart({ ...validFlavorChart, source })).toMatchObject({ source })
    }
  })

  it('rejects axis values outside [0, 1]', () => {
    expect(() => parseFlavorChart({ ...validFlavorChart, f1: -0.01 })).toThrow()
    expect(() => parseFlavorChart({ ...validFlavorChart, f6: 1.01 })).toThrow()
  })

  it('rejects a chart without a source', () => {
    expect(() =>
      parseFlavorChart({
        brandId: 2,
        f1: 0.5,
        f2: 0.5,
        f3: 0.5,
        f4: 0.5,
        f5: 0.5,
        f6: 0.5,
      }),
    ).toThrow()
  })

  it('rejects an unknown source value', () => {
    expect(() =>
      parseFlavorChart({ ...validFlavorChart, source: 'mystery_provider' }),
    ).toThrow()
  })

  it('rejects a non-positive brandId', () => {
    expect(() => parseFlavorChart({ ...validFlavorChart, brandId: 0 })).toThrow()
    expect(() => parseFlavorChart({ ...validFlavorChart, brandId: -1 })).toThrow()
  })

  it('rejects missing axis values', () => {
    const partial: Record<string, unknown> = { ...validFlavorChart }
    delete partial.f4
    expect(() => parseFlavorChart(partial)).toThrow()
  })

  it('exposes FlavorChartSchema for composition', () => {
    expect(FlavorChartSchema.parse(validFlavorChart)).toEqual(validFlavorChart)
  })
})

describe('FLAVOR_AXES', () => {
  it('lists the six axes in canonical order', () => {
    expect(FLAVOR_AXES).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6'])
  })

  it('is assignable to FlavorAxis (type-level smoke)', () => {
    const axis: FlavorAxis = 'f3'
    expect(FLAVOR_AXES).toContain(axis)
  })
})

describe('FLAVOR_AXIS_ROMAJI', () => {
  it('maps each axis to its CONTEXT.md vocabulary romaji', () => {
    expect(FLAVOR_AXIS_ROMAJI).toEqual({
      f1: 'hanayaka',
      f2: 'hojun',
      f3: 'juko',
      f4: 'odayaka',
      f5: 'dry',
      f6: 'keikai',
    })
  })

  it('uses "keikai" for f6 (not the unrelated "karoyaka" reading of 軽やか)', () => {
    // Guards the transcription correction recorded in CONTEXT.md.
    expect(FLAVOR_AXIS_ROMAJI.f6).toBe('keikai')
  })
})
