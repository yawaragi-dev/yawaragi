import { describe, expect, it } from 'vitest'
import { computeVelocity } from './velocity'
import type { PullRequestRecord } from './types'

function pr(mergedAt: string, additions: number, deletions: number): PullRequestRecord {
  return {
    number: 1,
    title: 'whatever',
    mergedAt,
    createdAt: mergedAt,
    additions,
    deletions,
    changedFiles: 1,
  }
}

describe('computeVelocity', () => {
  const now = new Date('2026-05-31T12:00:00Z')

  it('counts only PRs merged inside the window', () => {
    const v = computeVelocity(
      [
        pr('2026-05-30T12:00:00Z', 100, 0), // 1 day ago — in
        pr('2026-05-10T12:00:00Z', 5000, 0), // 21 days ago — out (window 14)
      ],
      now,
      14,
    )
    expect(v.totalLoc).toBe(100)
    expect(v.prCount).toBe(1)
  })

  it('divides by the window length, not by PR count, so idle days drag the average down', () => {
    const v = computeVelocity([pr('2026-05-30T12:00:00Z', 1400, 0)], now, 14)
    expect(v.locPerDay).toBe(100) // 1400 / 14, not 1400 / 1
  })

  it('returns zero velocity for an empty window', () => {
    const v = computeVelocity([], now, 14)
    expect(v.locPerDay).toBe(0)
    expect(v.totalLoc).toBe(0)
    expect(v.prCount).toBe(0)
  })

  it('survives an invalid mergedAt string instead of crashing the dashboard', () => {
    const v = computeVelocity(
      [
        { ...pr('2026-05-30T12:00:00Z', 100, 0), mergedAt: 'not-a-date' },
      ],
      now,
      14,
    )
    expect(v.prCount).toBe(0)
  })
})
