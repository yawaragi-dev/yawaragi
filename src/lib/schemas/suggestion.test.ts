import { describe, expect, it } from 'vitest'
import {
  parseSuggestion,
  parseSuggestionList,
  SuggestionSchema,
} from './suggestion'

/**
 * Schema tests for the Phase 4 / S5 Suggestion wire shape.
 *
 * The value of this shape is that per-field provenance is enforced at the
 * parse seam: the LLM cannot emit a suggestion whose `reason` self-declares
 * as `sakenowa`, or a `cross_beverage_descriptor` whose provenance
 * masquerades as `llm_inferred`. Every test below is asserting a
 * user-visible invariant (glance-readable source mixing on the card) that
 * only holds if `parse` rejects a bad shape.
 */

const VALID: Record<string, unknown> = {
  brandId: { source: 'sakenowa', value: 1234 },
  name_ja: { source: 'sakenowa', value: '獺祭' },
  name_romaji: { source: 'sakenowa', value: 'Dassai' },
  reason: {
    source: 'llm_inferred',
    value: 'Similarly aromatic and fruit-forward — Nagano region parallel.',
  },
}

describe('parseSuggestion', () => {
  it('accepts a minimal seed-mode suggestion (no cross-beverage descriptor)', () => {
    const parsed = parseSuggestion(VALID)
    expect(parsed.brandId.value).toBe(1234)
    expect(parsed.reason.source).toBe('llm_inferred')
    expect(parsed.cross_beverage_descriptor).toBeUndefined()
  })

  it('accepts a cross-beverage-seeded suggestion when the descriptor is present', () => {
    const parsed = parseSuggestion({
      ...VALID,
      cross_beverage_descriptor: { source: 'cross_beverage_map', value: 'smoky' },
    })
    expect(parsed.cross_beverage_descriptor?.value).toBe('smoky')
    expect(parsed.cross_beverage_descriptor?.source).toBe('cross_beverage_map')
  })

  it('rejects a reason field that self-declares as sakenowa (source is pinned at the parse seam)', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        reason: { source: 'sakenowa', value: 'not allowed' },
      }),
    ).toThrow()
  })

  it('rejects a cross_beverage_descriptor field with the wrong source literal', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        cross_beverage_descriptor: { source: 'llm_inferred', value: 'smoky' },
      }),
    ).toThrow()
  })

  it('rejects a brandId with source "llm_inferred" (only Sakenowa canonical is legal)', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        brandId: { source: 'llm_inferred', value: 42 },
      }),
    ).toThrow()
  })

  it('rejects a missing required field', () => {
    // Drop `name_romaji` — the schema requires it because the card UI
    // shows non-Japanese readers what the sake sounds like.
    const { name_romaji: _dropped, ...rest } = VALID
    void _dropped
    expect(() => parseSuggestion(rest)).toThrow()
  })

  it('rejects a non-positive brandId (parses off the Sakenowa Brand PK contract)', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        brandId: { source: 'sakenowa', value: 0 },
      }),
    ).toThrow()
  })

  it('rejects an empty reason string (min length 1)', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        reason: { source: 'llm_inferred', value: '' },
      }),
    ).toThrow()
  })

  it('rejects a reason longer than the layout cap', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        reason: { source: 'llm_inferred', value: 'a'.repeat(501) },
      }),
    ).toThrow()
  })

  it('exports SuggestionSchema so callers can reuse it in composite parsers', () => {
    // Redundant with `parseSuggestion` at runtime, but the export is
    // load-bearing for suggest-action.ts which iterates a raw model
    // output and safeParse's per-record; a rename or removal here would
    // silently break that iteration.
    const result = SuggestionSchema.safeParse(VALID)
    expect(result.success).toBe(true)
  })

  // -------- flavor_profile (round-2 fan-out from get_sake_details) --------

  it('accepts a suggestion carrying a flavor_profile hydrated by the MCP fan-out', () => {
    // The flavor_profile field is the Phase 4 / S5 round-2 addition. It
    // is populated by `suggest-action.ts` calling `get_sake_details` per
    // brandId AFTER the LLM tool loop returns — a deterministic post-
    // enrichment step, NEVER emitted by the LLM itself. The source is
    // pinned to `sakenowa` because the axes come from the canonical
    // Sakenowa mirror.
    const parsed = parseSuggestion({
      ...VALID,
      flavor_profile: {
        source: 'sakenowa',
        f1: 0.7,
        f2: 0.4,
        f3: 0.3,
        f4: 0.5,
        f5: 0.6,
        f6: 0.8,
      },
    })
    expect(parsed.flavor_profile?.source).toBe('sakenowa')
    expect(parsed.flavor_profile?.f1).toBe(0.7)
    expect(parsed.flavor_profile?.f6).toBe(0.8)
  })

  it('leaves flavor_profile undefined when the source data is absent (no chart in mirror)', () => {
    // A brand with no row in `flavor_charts` — the MCP `get_sake_details`
    // returns `flavorProfile: null`, the fan-out drops the field, and
    // the card renders without the axis cluster (no placeholder). This
    // asserts the field is genuinely optional at the parse seam.
    const parsed = parseSuggestion(VALID)
    expect(parsed.flavor_profile).toBeUndefined()
  })

  it('rejects a flavor_profile whose source is not sakenowa (canonical only)', () => {
    // The LLM must never be able to fabricate axis positions. Pinning
    // the source at the parse seam means a hallucinated
    // `flavor_profile: { source: "llm_inferred", ... }` fails schema and
    // gets dropped from the visible result list.
    expect(() =>
      parseSuggestion({
        ...VALID,
        flavor_profile: {
          source: 'llm_inferred',
          f1: 0.7,
          f2: 0.4,
          f3: 0.3,
          f4: 0.5,
          f5: 0.6,
          f6: 0.8,
        },
      }),
    ).toThrow()
  })

  it('rejects a flavor_profile axis value outside [0, 1] (matches Sakenowa contract)', () => {
    expect(() =>
      parseSuggestion({
        ...VALID,
        flavor_profile: {
          source: 'sakenowa',
          f1: 1.5,
          f2: 0.4,
          f3: 0.3,
          f4: 0.5,
          f5: 0.6,
          f6: 0.8,
        },
      }),
    ).toThrow()
  })

  it('coerces flavor_profile: null (from raw JSON) into an absent field', () => {
    // The MCP fan-out layer normalises `null` to `undefined` before
    // handing the row to the schema, but a defence-in-depth preprocess
    // at the parse seam means a stray null from a future refactor
    // doesn't blow up parseSuggestion. Callers should still normalise
    // upstream; this is a belt-and-suspenders.
    const parsed = parseSuggestion({
      ...VALID,
      flavor_profile: null,
    })
    expect(parsed.flavor_profile).toBeUndefined()
  })
})

describe('parseSuggestionList', () => {
  it('accepts the empty list (honest no-match path)', () => {
    expect(parseSuggestionList([])).toEqual([])
  })

  it('accepts 6 suggestions (the layout upper bound)', () => {
    const six = Array.from({ length: 6 }, () => VALID)
    expect(parseSuggestionList(six)).toHaveLength(6)
  })

  it('rejects 7 suggestions (over the layout cap)', () => {
    const seven = Array.from({ length: 7 }, () => VALID)
    expect(() => parseSuggestionList(seven)).toThrow()
  })
})
