import { describe, expect, it } from 'vitest'
import type { ProvenanceSource } from '@/lib/schemas/with-provenance'
import {
  isBlendedRecord,
  isCanonical,
  isLLMSourced,
  resolveBadgeKind,
  shouldRenderBadge,
  shouldRenderHeuristicDisclaimer,
} from './policy'

// Enumerating every source explicitly (not deriving from the Zod enum)
// is intentional: the tests are the spec, and a future enum addition
// must show up as a TS compile error here AND a test surface — not get
// silently looped over.
const ALL_SOURCES = [
  'sakenowa',
  'sakenowa_inferred',
  'llm_extracted',
  'llm_inferred',
  'cross_beverage_map',
  'user_corrected',
  'manual_curation',
] as const satisfies ReadonlyArray<ProvenanceSource>

describe('shouldRenderBadge', () => {
  it('flags the three non-canonical sources that need a visible badge', () => {
    expect(shouldRenderBadge('llm_extracted')).toBe(true)
    expect(shouldRenderBadge('llm_inferred')).toBe(true)
    expect(shouldRenderBadge('cross_beverage_map')).toBe(true)
  })

  it('does not flag Sakenowa, derived-Sakenowa, user-corrected, or hand-curated values', () => {
    expect(shouldRenderBadge('sakenowa')).toBe(false)
    expect(shouldRenderBadge('sakenowa_inferred')).toBe(false)
    expect(shouldRenderBadge('user_corrected')).toBe(false)
    expect(shouldRenderBadge('manual_curation')).toBe(false)
  })

  it('returns a boolean for every source in the taxonomy', () => {
    // Guard against a future "8th source" landing without an explicit
    // entry — the lookup table's `satisfies` clause catches it at
    // compile time, this catches a regression at runtime too.
    for (const s of ALL_SOURCES) {
      expect(typeof shouldRenderBadge(s)).toBe('boolean')
    }
  })
})

describe('shouldRenderHeuristicDisclaimer', () => {
  it('flags only cross_beverage_map, the one source that owes the heuristic caveat', () => {
    // ADR-0005: the cross-beverage map is the only deterministic-but-
    // heuristic source, so it's the only one whose failure mode ("the
    // mapping is wrong") needs the honesty disclaimer next to the badge.
    expect(shouldRenderHeuristicDisclaimer('cross_beverage_map')).toBe(true)
  })

  it('does not flag any other source, LLM-sourced or canonical', () => {
    expect(shouldRenderHeuristicDisclaimer('sakenowa')).toBe(false)
    expect(shouldRenderHeuristicDisclaimer('sakenowa_inferred')).toBe(false)
    expect(shouldRenderHeuristicDisclaimer('llm_extracted')).toBe(false)
    expect(shouldRenderHeuristicDisclaimer('llm_inferred')).toBe(false)
    expect(shouldRenderHeuristicDisclaimer('user_corrected')).toBe(false)
    expect(shouldRenderHeuristicDisclaimer('manual_curation')).toBe(false)
  })

  it('returns a boolean for every source in the taxonomy', () => {
    for (const s of ALL_SOURCES) {
      expect(typeof shouldRenderHeuristicDisclaimer(s)).toBe('boolean')
    }
  })

  it('only ever fires for a source that also gets a badge', () => {
    // A disclaimer without a badge would be an ADR-0005 contradiction:
    // the caveat marks a value the user is already told is non-canonical.
    for (const s of ALL_SOURCES) {
      if (shouldRenderHeuristicDisclaimer(s)) {
        expect(shouldRenderBadge(s)).toBe(true)
      }
    }
  })
})

describe('resolveBadgeKind', () => {
  it('maps each badged source to its distinct presentation kind', () => {
    expect(resolveBadgeKind('llm_extracted')).toBe('llmExtracted')
    expect(resolveBadgeKind('llm_inferred')).toBe('llmInferred')
    expect(resolveBadgeKind('cross_beverage_map')).toBe('crossBeverageMap')
  })

  it('returns null for every canonical source so callers render no badge', () => {
    expect(resolveBadgeKind('sakenowa')).toBeNull()
    expect(resolveBadgeKind('sakenowa_inferred')).toBeNull()
    expect(resolveBadgeKind('user_corrected')).toBeNull()
    expect(resolveBadgeKind('manual_curation')).toBeNull()
  })

  it('is non-null exactly when shouldRenderBadge is true, across the taxonomy', () => {
    // The two tables must never drift: a badged source must resolve to a
    // kind, and a canonical source must resolve to null. This is the seam
    // the scan client callers and the async server wrapper both route
    // through — if someone flips one table without the other, this fails.
    for (const s of ALL_SOURCES) {
      expect(resolveBadgeKind(s) !== null).toBe(shouldRenderBadge(s))
    }
  })
})

describe('isCanonical', () => {
  it('is the exact inverse of shouldRenderBadge across the taxonomy', () => {
    for (const s of ALL_SOURCES) {
      expect(isCanonical(s)).toBe(!shouldRenderBadge(s))
    }
  })

  it('treats sakenowa, sakenowa_inferred, user_corrected, manual_curation as canonical', () => {
    expect(isCanonical('sakenowa')).toBe(true)
    expect(isCanonical('sakenowa_inferred')).toBe(true)
    expect(isCanonical('user_corrected')).toBe(true)
    expect(isCanonical('manual_curation')).toBe(true)
  })

  it('treats llm_extracted, llm_inferred, cross_beverage_map as non-canonical', () => {
    expect(isCanonical('llm_extracted')).toBe(false)
    expect(isCanonical('llm_inferred')).toBe(false)
    expect(isCanonical('cross_beverage_map')).toBe(false)
  })
})

describe('isLLMSourced', () => {
  it('is true only for llm_extracted and llm_inferred', () => {
    expect(isLLMSourced('llm_extracted')).toBe(true)
    expect(isLLMSourced('llm_inferred')).toBe(true)
  })

  it('does not treat the deterministic cross-beverage map as LLM-sourced', () => {
    // The cross-beverage map is hand-curated and table-driven — the LLM
    // is explicitly forbidden from inventing entries (CLAUDE.md). It
    // gets a badge for "this is an approximation" reasons, not because
    // a model produced it.
    expect(isLLMSourced('cross_beverage_map')).toBe(false)
  })

  it('is false for all canonical sources', () => {
    expect(isLLMSourced('sakenowa')).toBe(false)
    expect(isLLMSourced('sakenowa_inferred')).toBe(false)
    expect(isLLMSourced('user_corrected')).toBe(false)
    expect(isLLMSourced('manual_curation')).toBe(false)
  })
})

describe('isBlendedRecord', () => {
  it('returns false for an empty source set', () => {
    expect(isBlendedRecord([])).toBe(false)
  })

  it('returns false when every source is canonical', () => {
    expect(isBlendedRecord(['sakenowa'])).toBe(false)
    expect(isBlendedRecord(['sakenowa', 'sakenowa_inferred'])).toBe(false)
    expect(
      isBlendedRecord(['sakenowa', 'user_corrected', 'manual_curation']),
    ).toBe(false)
  })

  it('returns false when every source is non-canonical', () => {
    expect(isBlendedRecord(['llm_extracted'])).toBe(false)
    expect(
      isBlendedRecord(['llm_extracted', 'llm_inferred', 'cross_beverage_map']),
    ).toBe(false)
  })

  it('returns false for a single-source array regardless of source type', () => {
    for (const s of ALL_SOURCES) {
      expect(isBlendedRecord([s])).toBe(false)
    }
  })

  it('returns true when the array mixes canonical and non-canonical sources', () => {
    // The CLAUDE.md rule: "A recommendation card showing 4 facts from
    // Sakenowa and 1 from the LLM must visually distinguish them." This
    // predicate is how the UI detects the mixed case.
    expect(isBlendedRecord(['sakenowa', 'llm_extracted'])).toBe(true)
    expect(isBlendedRecord(['llm_inferred', 'sakenowa'])).toBe(true)
    expect(
      isBlendedRecord(['sakenowa', 'sakenowa_inferred', 'llm_inferred']),
    ).toBe(true)
    expect(
      isBlendedRecord(['manual_curation', 'cross_beverage_map']),
    ).toBe(true)
  })

  it('treats repeats of the same source as not blended', () => {
    expect(isBlendedRecord(['sakenowa', 'sakenowa', 'sakenowa'])).toBe(false)
    expect(
      isBlendedRecord(['llm_extracted', 'llm_extracted']),
    ).toBe(false)
  })
})
