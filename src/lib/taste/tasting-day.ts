/**
 * A tasting's day, `YYYY-MM-DD`, and the instant the journal stores for it.
 *
 * The journal draws dates in UTC (the list, §9.3), so a chosen day is stored
 * as noon UTC on that day: the same calendar day for every reader, whatever
 * their offset.
 */
export function tastingDayAt(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d, 12)
}

/** The day a stored instant falls on, as the journal draws it (UTC). */
export function tastingDayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}
