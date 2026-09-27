import { MAX_RATING, RATING_STEP } from '@/lib/taste/taste-action-state'

/**
 * A rating rendered as a five-glyph star row for the journal timeline.
 *
 * Exists because the obvious form is wrong on half ratings:
 * `'★'.repeat(4.5) + '☆'.repeat(5 - 4.5)` truncates both counts, giving
 * `'★★★★'` — a 4.5 that looks exactly like a 4 and a row one character
 * narrower than its neighbours. Since design v1.4 §5 the scale runs in half
 * steps, so this counts in halves rather than whole stars.
 *
 * `½` rather than U+2BEA (STAR WITH LEFT HALF BLACK): the half-star codepoints
 * have patchy font coverage and a missing glyph would render a tofu box where
 * the rating should be. §12 replaces this with the real 34px half-filled star
 * when the Palate and result card are ported; until then this is the text
 * stand-in, and it needs to be *honest* rather than pretty.
 *
 * Lives here rather than in `journal-view.tsx` because that component is an
 * async RSC, which Vitest cannot render (CLAUDE.md) — a pure function is the
 * only way this guarantee gets a unit test.
 */
export function ratingStars(rating: number): string {
  // Clamped, not rejected: this is display-side. A value that escaped schema
  // validation should still render a row instead of throwing inside the
  // timeline — `'☆'.repeat(-1)` is a RangeError. Rounding to the nearest half
  // also keeps the row five wide for an off-scale float.
  const steps = MAX_RATING / RATING_STEP
  const halves = Math.min(steps, Math.max(0, Math.round(rating / RATING_STEP)))
  const full = Math.floor(halves / 2)
  const half = halves % 2
  return '★'.repeat(full) + '½'.repeat(half) + '☆'.repeat(steps / 2 - full - half)
}
