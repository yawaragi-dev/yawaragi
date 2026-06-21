import { describe, expect, it } from 'vitest'
import { CrossBeverageMapSchema, parseCrossBeverageMap } from './cross-beverage-map'

const validEntry = {
  source: 'cross_beverage_map',
  descriptor: 'smoky',
  beverage: 'whisky',
  f1: 0.1,
  f2: 0.4,
  f3: 0.7,
  f4: 0.3,
  f5: 0.6,
  f6: 0.2,
} as const

describe('CrossBeverageMap schema', () => {
  it('parses a valid hand-curated entry', () => {
    expect(parseCrossBeverageMap(validEntry)).toEqual(validEntry)
  })

  it('accepts an optional confidence from the WithProvenance mixin', () => {
    expect(parseCrossBeverageMap({ ...validEntry, confidence: 0.5 })).toMatchObject({
      confidence: 0.5,
    })
  })

  it('rejects any source other than the cross_beverage_map literal', () => {
    // Even other valid ProvenanceSource enum values must fail: this record
    // type is the one place that pins the literal so the UI knows to render
    // the HeuristicDisclaimer.
    expect(() => parseCrossBeverageMap({ ...validEntry, source: 'sakenowa' })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, source: 'llm_inferred' })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, source: 'manual_curation' })).toThrow()
  })

  it('rejects an entry without a source', () => {
    expect(() =>
      parseCrossBeverageMap({
        descriptor: 'smoky',
        beverage: 'whisky',
        f1: 0.1,
        f2: 0.4,
        f3: 0.7,
        f4: 0.3,
        f5: 0.6,
        f6: 0.2,
      }),
    ).toThrow()
  })

  it('rejects an empty descriptor', () => {
    expect(() => parseCrossBeverageMap({ ...validEntry, descriptor: '' })).toThrow()
  })

  it('rejects an unknown beverage kind', () => {
    // Schema extended in #150 (2026-06-21) to add spirit / fortified /
    // cider on top of whisky / wine / beer. We assert rejection on a
    // value the enum legitimately does not cover (mead, kombucha).
    expect(() => parseCrossBeverageMap({ ...validEntry, beverage: 'sake' })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, beverage: 'mead' })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, beverage: 'kombucha' })).toThrow()
  })

  it('accepts the spirit / fortified / cider beverages added in #150', () => {
    expect(parseCrossBeverageMap({ ...validEntry, beverage: 'spirit' })).toMatchObject({
      beverage: 'spirit',
    })
    expect(parseCrossBeverageMap({ ...validEntry, beverage: 'fortified' })).toMatchObject({
      beverage: 'fortified',
    })
    expect(parseCrossBeverageMap({ ...validEntry, beverage: 'cider' })).toMatchObject({
      beverage: 'cider',
    })
  })

  it('rejects flavor-axis values outside [0, 1]', () => {
    expect(() => parseCrossBeverageMap({ ...validEntry, f1: -0.01 })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, f3: 1.01 })).toThrow()
    expect(() => parseCrossBeverageMap({ ...validEntry, f6: 2 })).toThrow()
  })

  it('exposes CrossBeverageMapSchema for composition', () => {
    expect(CrossBeverageMapSchema.parse(validEntry)).toEqual(validEntry)
  })
})
