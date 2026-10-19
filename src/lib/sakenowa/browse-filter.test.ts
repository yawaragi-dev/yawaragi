import { describe, expect, it } from 'vitest'
import { flavorBound, parseBrowseFilter, withFilter } from './browse-filter'

const STATS = {
  mean: { f1: 0.4, f2: 0.5, f3: 0.4, f4: 0.5, f5: 0.4, f6: 0.5 },
  sd: { f1: 0.1, f2: 0.08, f3: 0.12, f4: 0.1, f5: 0.1, f6: 0.1 },
}

describe('parseBrowseFilter', () => {
  it('reads a prefecture and a flavor direction from the address', () => {
    expect(parseBrowseFilter({ pref: '12', flavor: 'more-f3' })).toEqual({
      areaId: 12,
      flavor: { axis: 'f3', direction: 'more' },
    })
  })

  it('ignores what is not a prefecture or a flavor axis, rather than failing the page', () => {
    expect(parseBrowseFilter({ pref: '99', flavor: 'more-f9' })).toEqual({ areaId: null, flavor: null })
    expect(parseBrowseFilter({ pref: 'chiba', flavor: 'louder-f1' })).toEqual({ areaId: null, flavor: null })
    expect(parseBrowseFilter({ pref: ['13', '12'] })).toEqual({ areaId: 13, flavor: null })
  })
})

describe('flavorBound', () => {
  it('puts "more" one spread above the catalogue average, as "Goes with" does', () => {
    expect(flavorBound(STATS, { axis: 'f3', direction: 'more' })).toBeCloseTo(0.52)
  })

  it('puts "less" one spread below it', () => {
    expect(flavorBound(STATS, { axis: 'f1', direction: 'less' })).toBeCloseTo(0.3)
  })
})

describe('withFilter', () => {
  it('keeps the other filter when one changes, and drops a filter set to nothing', () => {
    const current = { areaId: 12, flavor: { axis: 'f3' as const, direction: 'more' as const } }
    expect(withFilter(current, { areaId: 13 })).toEqual({ pref: '13', flavor: 'more-f3' })
    expect(withFilter(current, { flavor: null })).toEqual({ pref: '12' })
  })
})
