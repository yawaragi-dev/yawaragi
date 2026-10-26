import { describe, expect, it } from 'vitest'
import { requiresSakenowaAttribution } from './sakenowa-attribution'

describe('requiresSakenowaAttribution', () => {
  // ADR-0014: a page mounts `<SakenowaAttribution />` iff at least one
  // rendered record's `source` is in the Sakenowa attribution set. The
  // predicate is the single decision point so future sources (NTA,
  // Wikidata, …) get sibling predicates without touching this one.
  it('returns true when the set contains "sakenowa"', () => {
    expect(requiresSakenowaAttribution(new Set(['sakenowa']))).toBe(true)
  })

  it('returns true when the set contains "sakenowa_inferred"', () => {
    expect(requiresSakenowaAttribution(new Set(['sakenowa_inferred']))).toBe(true)
  })

  it('returns true for an amalgam page where ONE rendered record is Sakenowa-sourced', () => {
    // The UMAMI case: brand=manual_curation, brewery=sakenowa,
    // flavor_chart absent. Attribution still required because the
    // rendered brewery info is Sakenowa data.
    expect(
      requiresSakenowaAttribution(new Set(['manual_curation', 'sakenowa'])),
    ).toBe(true)
  })

  it('returns false when no rendered record is Sakenowa-sourced', () => {
    // A hypothetical fully-manual sake (brand AND brewery both
    // `manual_curation`) — no attribution obligation triggers.
    expect(
      requiresSakenowaAttribution(new Set(['manual_curation', 'llm_extracted'])),
    ).toBe(false)
  })

  it('tolerates null / undefined entries in the iterable', () => {
    // Pages aggregate sources via `[brand.source, brewery?.source,
    // flavorChart?.source]` — null entries (missing brewery, no flavor
    // chart yet) must not throw and must not flip the result.
    expect(
      requiresSakenowaAttribution(['sakenowa', null, undefined]),
    ).toBe(true)
    expect(requiresSakenowaAttribution([null, undefined])).toBe(false)
  })

  it('returns false for an empty set', () => {
    expect(requiresSakenowaAttribution(new Set<string>())).toBe(false)
  })
})
