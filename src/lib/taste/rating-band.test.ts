import { describe, expect, it } from 'vitest'
import { RATING_BANDS, type RatingBand, ratingBand } from '@/lib/taste/rating-band'
import { MAX_RATING, MIN_RATING, isValidRating } from '@/lib/taste/taste-action-state'

/** Every rating the half-star scale can produce, low to high. */
const ALL_RATINGS = Array.from({ length: 10 }, (_, i) => (i + 1) / 2)

describe('ratingBand', () => {
  it('gives every rating on the scale a band', () => {
    for (const r of ALL_RATINGS) {
      expect(RATING_BANDS).toContain(ratingBand(r))
    }
  })

  it('places each rating in the band the design specifies', () => {
    // Spelled out rather than derived from the same table the implementation
    // reads — a test that recomputes the thresholds would pass even if they
    // were all wrong together.
    const expected: Record<number, RatingBand> = {
      0.5: 'pouredItOut',
      1: 'pouredItOut',
      1.5: 'notForMe',
      2: 'notForMe',
      2.5: 'solid',
      3: 'solid',
      3.5: 'veryGood',
      4: 'veryGood',
      4.5: 'outstanding',
      5: 'outstanding',
    }
    for (const [rating, band] of Object.entries(expected)) {
      expect(ratingBand(Number(rating))).toBe(band)
    }
  })

  it('treats a threshold as belonging to the band above it', () => {
    // The boundary cases are where an off-by-a-hair comparison hides: 3.5 is
    // "Very good", not "Solid". Half stars put a real rating on every
    // threshold, so this is reachable by a user, not a theoretical edge.
    expect(ratingBand(3.5)).toBe('veryGood')
    expect(ratingBand(3.49)).toBe('solid')
    expect(ratingBand(4.5)).toBe('outstanding')
    expect(ratingBand(4.49)).toBe('veryGood')
  })

  it('never returns the same band for the whole scale', () => {
    // Guards the failure where the loop returns on the first entry: every
    // rating would render "Outstanding" and look plausible in a screenshot.
    expect(new Set(ALL_RATINGS.map(ratingBand)).size).toBe(RATING_BANDS.length)
  })

  it('clamps rather than throwing when handed a value off the scale', () => {
    // Display-side: a stray value should still produce a word. Rejection is
    // the schema's job, and an error path inside a label helps nobody.
    expect(ratingBand(0)).toBe('pouredItOut')
    expect(ratingBand(-3)).toBe('pouredItOut')
    expect(ratingBand(99)).toBe('outstanding')
  })
})

describe('isValidRating', () => {
  it('accepts every half-star value on the scale', () => {
    for (const r of ALL_RATINGS) expect(isValidRating(r)).toBe(true)
  })

  it('rejects values between the half-star steps', () => {
    // The whole reason the scale is a scale: 3.7 has no star row to render.
    for (const r of [1.25, 2.1, 3.7, 4.99]) expect(isValidRating(r)).toBe(false)
  })

  it('rejects zero, so "not rated" stays distinct from "rated lowest"', () => {
    // The star row has no unrated position — the absence of a rating is the
    // absence of an event, not a 0. Accepting 0 would silently create a
    // strongly negative taste event out of a UI that never offered one.
    expect(isValidRating(0)).toBe(false)
    expect(isValidRating(MIN_RATING)).toBe(true)
  })

  it('rejects values outside the bounds and non-finite input', () => {
    expect(isValidRating(MAX_RATING + 0.5)).toBe(false)
    expect(isValidRating(-0.5)).toBe(false)
    expect(isValidRating(Number.NaN)).toBe(false)
    expect(isValidRating(Number.POSITIVE_INFINITY)).toBe(false)
  })
})
