import { describe, expect, it } from 'vitest'
import { CrossBeverageMapSchema } from '@/lib/schemas/cross-beverage-map'
import { CROSS_BEVERAGE_MAP } from './cross-beverage-data'

describe('CROSS_BEVERAGE_MAP', () => {
  it('parses every row against CrossBeverageMapSchema', () => {
    // The module already runs parseCrossBeverageMap at import time, so this
    // test would never reach the assertion if a row were malformed — but
    // re-parsing here means a future schema tightening (e.g. lower-bound on
    // f-axes, or stricter descriptor regex) is caught by the unit suite
    // rather than only by the importing module.
    for (const row of CROSS_BEVERAGE_MAP) {
      expect(() => CrossBeverageMapSchema.parse(row)).not.toThrow()
    }
  })

  it('contains no duplicate (descriptor, beverage) pairs', () => {
    const seen = new Set<string>()
    for (const row of CROSS_BEVERAGE_MAP) {
      const key = `${row.beverage}::${row.descriptor}`
      expect(seen.has(key), `duplicate (descriptor, beverage): ${key}`).toBe(false)
      seen.add(key)
    }
  })

  it('covers all three beverage kinds in the schema enum', () => {
    const beverages = new Set(CROSS_BEVERAGE_MAP.map((row) => row.beverage))
    expect(beverages).toEqual(new Set(['whisky', 'wine', 'beer']))
  })

  it('uses lowercase, hyphen-or-letter-only descriptors', () => {
    // CLAUDE.md / issue #140 convention: lowercase, single word or
    // hyphenated compound. Not enforced by the schema (which only requires
    // non-empty string) — enforced here so a fresh maintainer adding a row
    // without reading the JSDoc gets a test failure rather than a quietly
    // diverging convention.
    const valid = /^[a-z]+(-[a-z]+)*$/
    for (const row of CROSS_BEVERAGE_MAP) {
      expect(row.descriptor, `bad descriptor format: ${row.descriptor}`).toMatch(valid)
    }
  })
})
