// Velocity proxy: lines-of-code merged per calendar day across the
// trailing window. We expose `windowDays` and `prCount` on the result
// so the dashboard can render the confidence narrative honestly
// ("based on N PRs over D days") rather than presenting a precise-but-
// fake number.

import type { PullRequestRecord, Velocity } from './types'
import { locOfPr } from './weighting'

export const DEFAULT_WINDOW_DAYS = 14

export function computeVelocity(
  prs: ReadonlyArray<PullRequestRecord>,
  now: Date,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Velocity {
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000
  const inWindow = prs.filter((pr) => {
    const mergedMs = new Date(pr.mergedAt).getTime()
    return Number.isFinite(mergedMs) && mergedMs >= cutoffMs
  })
  const totalLoc = inWindow.reduce((sum, pr) => sum + locOfPr(pr), 0)
  // We divide by the full window length (not by `inWindow.length`) on
  // purpose: idle days count against velocity. A team that merged 1000
  // LoC last Friday and nothing since shouldn't appear to be moving at
  // 1000 LoC/day.
  const locPerDay = windowDays > 0 ? totalLoc / windowDays : 0
  return {
    locPerDay,
    windowDays,
    prCount: inWindow.length,
    totalLoc,
  }
}
