import { describe, expect, it } from 'vitest'
import { FlavorProfileSchema } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import {
  NEUTRAL_AXIS,
  TASTE_EVENT_HALF_LIFE_DAYS,
  deriveTasteProfile,
  tasteEventWeight,
} from './derive-taste-profile'

const NOW = 1_700_000_000_000
const DAY_MS = 86_400_000
const NEUTRAL = { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }
// A target sitting at the top of every axis, so "toward" means "up from 0.5"
// and the arithmetic is easy to check by hand.
const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }

const rating = (stars: number, at: number = NOW): TasteEvent => ({
  kind: 'rating',
  rating: stars,
  brandId: 123,
  target: TOP,
  occurredAt: at,
})

describe('tasteEventWeight', () => {
  it('maps a rating to (rating - 3) / 5, with 3 stars inert', () => {
    expect(tasteEventWeight(rating(1))).toBeCloseTo(-0.4, 10)
    expect(tasteEventWeight(rating(3))).toBe(0)
    expect(tasteEventWeight(rating(5))).toBeCloseTo(0.4, 10)
  })

  it('gives scan-accept +0.3 and cross-beverage seed +0.5', () => {
    expect(
      tasteEventWeight({ kind: 'scan_accept', brandId: 1, target: TOP, occurredAt: NOW }),
    ).toBe(0.3)
    expect(
      tasteEventWeight({
        kind: 'cross_beverage_seed',
        descriptor: 'smoky',
        target: TOP,
        occurredAt: NOW,
      }),
    ).toBe(0.5)
  })
})

describe('deriveTasteProfile', () => {
  it('returns the neutral 0.5 prior when there are no events', () => {
    expect(deriveTasteProfile([], NOW)).toEqual(NEUTRAL)
    expect(deriveTasteProfile([], NOW).f1).toBe(NEUTRAL_AXIS)
  })

  it('pulls the vector toward a positively-rated sake', () => {
    // weight 0.4, age 0 → f1 = 0.5 + 0.4·(1 − 0.5) = 0.7
    expect(deriveTasteProfile([rating(5)], NOW).f1).toBeCloseTo(0.7, 10)
  })

  it('pushes the vector away from a negatively-rated sake', () => {
    // weight −0.4, target at the top → the vector moves DOWN, below neutral.
    // f1 = 0.5 + (−0.4)·(1 − 0.5) = 0.3
    const v = deriveTasteProfile([rating(1)], NOW)
    expect(v.f1).toBeCloseTo(0.3, 10)
    expect(v.f1).toBeLessThan(NEUTRAL_AXIS)
  })

  it('leaves the vector unchanged for a 3-star (inert) rating', () => {
    expect(deriveTasteProfile([rating(3)], NOW)).toEqual(NEUTRAL)
  })

  it('converges monotonically toward the target under repeated likes', () => {
    const once = deriveTasteProfile([rating(5)], NOW).f1
    const twice = deriveTasteProfile([rating(5), rating(5)], NOW).f1
    const thrice = deriveTasteProfile([rating(5), rating(5), rating(5)], NOW).f1
    expect(twice).toBeGreaterThan(once)
    expect(thrice).toBeGreaterThan(twice)
    expect(thrice).toBeLessThan(1) // approaches but never reaches the target
  })

  it('applies an aged event more weakly than a fresh one (time-decay)', () => {
    const fresh = deriveTasteProfile([rating(5, NOW)], NOW).f1
    // One half-life old → effective weight halves (0.4 → 0.2): f1 = 0.5 + 0.2·0.5 = 0.6
    const aged = deriveTasteProfile(
      [rating(5, NOW - TASTE_EVENT_HALF_LIFE_DAYS * DAY_MS)],
      NOW,
    ).f1
    expect(aged).toBeCloseTo(0.6, 10)
    expect(aged).toBeLessThan(fresh)
  })

  it('keeps every axis within [0, 1] under repeated strong pushes (per-step clamp)', () => {
    // Four 1-star ratings toward the top push the vector down past 0; the
    // per-step clamp must saturate at 0 rather than let it escape the cube.
    const v = deriveTasteProfile([rating(1), rating(1), rating(1), rating(1)], NOW)
    expect(() => FlavorProfileSchema.parse(v)).not.toThrow()
    expect(Math.min(v.f1, v.f2, v.f3, v.f4, v.f5, v.f6)).toBe(0)
  })

  it('applies scan-accept and cross-beverage weights at their fixed strengths', () => {
    const scan = deriveTasteProfile(
      [{ kind: 'scan_accept', brandId: 1, target: TOP, occurredAt: NOW }],
      NOW,
    )
    const seed = deriveTasteProfile(
      [{ kind: 'cross_beverage_seed', descriptor: 'smoky', target: TOP, occurredAt: NOW }],
      NOW,
    )
    expect(scan.f1).toBeCloseTo(0.65, 10) // 0.5 + 0.3·0.5
    expect(seed.f1).toBeCloseTo(0.75, 10) // 0.5 + 0.5·0.5
  })

  it('is deterministic and order-independent of input array order', () => {
    // Two events at different times, passed newest-first, must derive the same
    // vector as oldest-first — the fold sorts by occurredAt internally.
    const older = rating(5, NOW - 2 * DAY_MS)
    const newer = rating(1, NOW - 1 * DAY_MS)
    const a = deriveTasteProfile([newer, older], NOW)
    const b = deriveTasteProfile([older, newer], NOW)
    expect(a).toEqual(b)
    // And a repeat call is identical (no hidden state).
    expect(deriveTasteProfile([newer, older], NOW)).toEqual(a)
  })
})
