import { MAX_RATING, MIN_RATING } from '@/lib/taste/taste-action-state'

/**
 * The word shown beside the star row — "4.5 · Outstanding" (design v1.4 §5).
 *
 * A band, not a per-value label: half stars give ten possible ratings and ten
 * adjectives would be noise, so the design groups them into five. The
 * thresholds are the design's, and they are deliberately NOT evenly spaced —
 * 4.5 and 5 share a band, while 1.5 down to 0.5 splits at 1.5. That asymmetry
 * is the point: the interesting distinctions live at the top of the scale,
 * where a drinker is choosing between good bottles.
 *
 * Returns a key, not a string. The caller resolves it through next-intl, so
 * the band logic stays a pure function testable without a locale and the
 * German words ("Hervorragend" is 12 characters against "Outstanding"'s 11)
 * are a translation concern rather than a layout constant baked in here.
 */

export const RATING_BANDS = [
  'outstanding',
  'veryGood',
  'solid',
  'notForMe',
  'pouredItOut',
] as const

export type RatingBand = (typeof RATING_BANDS)[number]

/** Descending thresholds — the first one the rating clears wins. */
const BANDS: ReadonlyArray<readonly [threshold: number, band: RatingBand]> = [
  [4.5, 'outstanding'],
  [3.5, 'veryGood'],
  [2.5, 'solid'],
  [1.5, 'notForMe'],
]

/**
 * Maps a rating on the 0.5–5 scale to its band.
 *
 * Out-of-range input is clamped rather than rejected. This is display-side:
 * a rating that somehow escaped validation should still render a word instead
 * of throwing inside a star row — the schema is where bad values are caught,
 * and duplicating that rejection here would put an error path in a label.
 */
export function ratingBand(rating: number): RatingBand {
  const clamped = Math.min(MAX_RATING, Math.max(MIN_RATING, rating))
  for (const [threshold, band] of BANDS) {
    if (clamped >= threshold) return band
  }
  return 'pouredItOut'
}
