/**
 * §3's relative age on a recent-tasting card — "2d", "1w".
 *
 * A date is the wrong unit here. §11's list answers "when did I drink this"
 * with a date block; §3 answers "how long ago", because the card is a reminder
 * and "2d" is read without arithmetic where "18 JUL" is not.
 *
 * Returns the unit and the count rather than a formatted string, so the
 * pluralisation and the abbreviation are the locale's business — German wants
 * "Gestern" where English wants "1d", and that decision belongs in
 * `messages/`, not here.
 *
 * `now` is a parameter, never `Date.now()`: a clock read inside this function
 * would make every caller untestable and every test time-dependent.
 */
export type AgeUnit = 'today' | 'day' | 'week' | 'month' | 'year'

export interface RelativeAge {
  readonly unit: AgeUnit
  readonly value: number
}

const DAY_MS = 24 * 60 * 60 * 1000

export function relativeAge(atMs: number, now: number): RelativeAge {
  // A future date is a backdated entry typed wrong, or a clock skew. Either
  // way "in 3 days" on a tasting you have already had is nonsense, so it
  // clamps to today.
  const days = Math.max(0, Math.floor((now - atMs) / DAY_MS))
  if (days < 1) return { unit: 'today', value: 0 }
  if (days < 7) return { unit: 'day', value: days }
  if (days < 30) return { unit: 'week', value: Math.floor(days / 7) }
  if (days < 365) return { unit: 'month', value: Math.floor(days / 30) }
  return { unit: 'year', value: Math.floor(days / 365) }
}
