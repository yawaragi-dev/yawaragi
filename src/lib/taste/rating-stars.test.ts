import { describe, expect, it } from 'vitest'
import { MAX_RATING, MIN_RATING } from '@/lib/taste/taste-action-state'
import { ratingStars } from '@/lib/taste/rating-stars'

describe('ratingStars', () => {
  it('shows a half rating as a half star rather than dropping it', () => {
    // The bug this function exists to prevent: `'★'.repeat(4.5)` truncates to
    // four, so a 4.5 rendered identically to a 4 *and* the row lost a
    // character. Half ratings are real since design v1.4 §5.
    expect(ratingStars(4.5)).toBe('★★★★½')
    expect(ratingStars(4)).toBe('★★★★☆')
    expect(ratingStars(4.5)).not.toBe(ratingStars(4))
  })

  it('keeps the row five glyphs wide at every point on the scale', () => {
    // A star row that changes width between entries makes the timeline ragged.
    for (let halves = 1; halves <= 10; halves += 1) {
      expect([...ratingStars(halves / 2)]).toHaveLength(5)
    }
  })

  it('renders the ends of the scale', () => {
    expect(ratingStars(MIN_RATING)).toBe('½☆☆☆☆')
    expect(ratingStars(MAX_RATING)).toBe('★★★★★')
  })

  it('survives a value that escaped validation', () => {
    // Display-side: a bad rating should still render a row, not throw inside
    // the timeline. `'☆'.repeat(-1)` is a RangeError, which is what an
    // unclamped implementation would do with 6.
    expect([...ratingStars(6)]).toHaveLength(5)
    expect([...ratingStars(0)]).toHaveLength(5)
    expect(ratingStars(3.7)).toBe(ratingStars(3.5))
  })
})
