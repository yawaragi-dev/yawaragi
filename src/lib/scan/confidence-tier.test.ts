import { describe, expect, it } from 'vitest'
import { resolveConfidenceTier } from './confidence-tier'

describe('resolveConfidenceTier', () => {
  // Tier thresholds from PRD #105 §"Three-tier confidence UX":
  //   - 'retry'   : confidence < 0.60
  //   - 'confirm' : 0.60 ≤ confidence < 0.85
  //   - 'auto'    : confidence ≥ 0.85
  //
  // The half-open intervals matter because the model's confidence
  // values are continuous; a visitor whose scan returns exactly 0.85
  // should land in the same tier as 0.86, not 0.84. Tested across the
  // boundary points so a refactor that flips a `<` to `<=` is caught.

  it('returns "retry" for clearly low confidence (0.0)', () => {
    expect(resolveConfidenceTier(0)).toBe('retry')
  })

  it('returns "retry" for the value just below the confirm threshold (0.59)', () => {
    expect(resolveConfidenceTier(0.59)).toBe('retry')
  })

  it('returns "confirm" exactly at the lower confirm boundary (0.60)', () => {
    expect(resolveConfidenceTier(0.6)).toBe('confirm')
  })

  it('returns "confirm" for a value in the middle of the confirm tier (0.72)', () => {
    // 0.72 represents the empirical median of our 2026-06-10 live
    // test session — most well-lit mobile photos land in this range,
    // so this is the dominant tier in production today.
    expect(resolveConfidenceTier(0.72)).toBe('confirm')
  })

  it('returns "confirm" for the value just below the auto threshold (0.84)', () => {
    expect(resolveConfidenceTier(0.84)).toBe('confirm')
  })

  it('returns "auto" exactly at the lower auto boundary (0.85)', () => {
    expect(resolveConfidenceTier(0.85)).toBe('auto')
  })

  it('returns "auto" for full confidence (1.0)', () => {
    expect(resolveConfidenceTier(1)).toBe('auto')
  })
})
