import { describe, expect, it } from 'vitest'
import { CrossBeverageMapSchema } from '@/lib/schemas/cross-beverage-map'
import {
  CROSS_BEVERAGE_DESCRIPTOR_ALIASES,
  CROSS_BEVERAGE_MAP,
} from './cross-beverage-data'

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

  it('covers every beverage kind the schema enum declares', () => {
    // Schema-extension on 2026-06-21 added spirit / fortified / cider on
    // top of the original whisky / wine / beer. Coverage assertion
    // (every enum value has at least one row) catches the case where a
    // future schema widening lands without companion data.
    const beverages = new Set(CROSS_BEVERAGE_MAP.map((row) => row.beverage))
    expect(beverages).toEqual(
      new Set(['whisky', 'wine', 'beer', 'spirit', 'fortified', 'cider']),
    )
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

describe('CROSS_BEVERAGE_DESCRIPTOR_ALIASES', () => {
  // Build the canonical-descriptor set once. Used by both invariants below.
  const canonicalDescriptors = new Set(CROSS_BEVERAGE_MAP.map((row) => row.descriptor))

  it('routes every alias to a real descriptor (no dangling targets)', () => {
    // An alias whose target doesn't exist in the table is a bug — the LLM
    // tool would resolve the alias and then fail the lookup. Catches the
    // case where someone deletes a row but forgets to scrub its aliases.
    for (const [alias, target] of Object.entries(CROSS_BEVERAGE_DESCRIPTOR_ALIASES)) {
      expect(
        canonicalDescriptors.has(target),
        `alias "${alias}" → "${target}" — but "${target}" is not a descriptor in CROSS_BEVERAGE_MAP`,
      ).toBe(true)
    }
  })

  it('does not alias a descriptor that already exists in the map', () => {
    // If an alias key is itself a real descriptor, the tool layer has two
    // entry points to the same row — confusing and probably a bug. Catches
    // the case where someone adds an alias for a term that's already a
    // canonical descriptor (would have happened if `peated` itself were
    // ever aliased, etc.).
    for (const alias of Object.keys(CROSS_BEVERAGE_DESCRIPTOR_ALIASES)) {
      expect(
        canonicalDescriptors.has(alias),
        `alias "${alias}" is already a canonical descriptor — would route to itself`,
      ).toBe(false)
    }
  })
})
