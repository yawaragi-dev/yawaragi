/**
 * §3's greeting — "Good evening" over 和らぎ.
 *
 * Four bands rather than three: a 23:00 visitor greeted "Good evening" reads
 * as a clock that stopped, and this product is used late (the design's own
 * reference screenshots are all stamped 21:40). The boundaries are the
 * conventional English ones, and they are a pure function of the hour so they
 * can be tested at every edge rather than observed at one.
 */
export type GreetingBand = 'morning' | 'afternoon' | 'evening' | 'night'

export function greetingBandFor(hour: number): GreetingBand {
  // Defensive rather than trusting: the caller reads a clock, and a clock that
  // returns NaN should produce a greeting, not a missing heading.
  if (!Number.isFinite(hour)) return 'evening'
  const h = Math.floor(hour)
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 18) return 'afternoon'
  if (h >= 18 && h < 23) return 'evening'
  return 'night'
}
