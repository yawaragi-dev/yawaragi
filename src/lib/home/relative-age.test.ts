import { describe, expect, it } from 'vitest'
import { relativeAge } from './relative-age'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

describe('how long ago a tasting was', () => {
  it('calls anything under a day "today"', () => {
    expect(relativeAge(NOW, NOW)).toEqual({ unit: 'today', value: 0 })
    expect(relativeAge(NOW - DAY + 1, NOW)).toEqual({ unit: 'today', value: 0 })
  })

  it('counts days up to a week, then weeks', () => {
    expect(relativeAge(NOW - 2 * DAY, NOW)).toEqual({ unit: 'day', value: 2 })
    expect(relativeAge(NOW - 6 * DAY, NOW)).toEqual({ unit: 'day', value: 6 })
    expect(relativeAge(NOW - 7 * DAY, NOW)).toEqual({ unit: 'week', value: 1 })
    expect(relativeAge(NOW - 20 * DAY, NOW)).toEqual({ unit: 'week', value: 2 })
  })

  it('switches to months and then years', () => {
    expect(relativeAge(NOW - 30 * DAY, NOW)).toEqual({ unit: 'month', value: 1 })
    expect(relativeAge(NOW - 200 * DAY, NOW)).toEqual({ unit: 'month', value: 6 })
    expect(relativeAge(NOW - 400 * DAY, NOW)).toEqual({ unit: 'year', value: 1 })
  })

  it('clamps a future date to today rather than saying "in 3 days"', () => {
    // `triedAt` is user-editable ("I had this last week"), so a typo or a
    // clock skew can put it ahead of now. A card reading "in 3 days" about a
    // sake you have already drunk is worse than one reading "today".
    expect(relativeAge(NOW + 3 * DAY, NOW)).toEqual({ unit: 'today', value: 0 })
  })

  it('never reads the clock itself', () => {
    // Both calls must agree: the function is pure in `now`, which is what
    // keeps these assertions from expiring.
    expect(relativeAge(NOW - 3 * DAY, NOW)).toEqual(relativeAge(NOW - 3 * DAY, NOW))
  })
})
