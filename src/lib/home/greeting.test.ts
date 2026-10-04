import { describe, expect, it } from 'vitest'
import { greetingBandFor } from './greeting'

describe('which greeting the clock earns', () => {
  it.each([
    [5, 'morning'],
    [11, 'morning'],
    [12, 'afternoon'],
    [17, 'afternoon'],
    [18, 'evening'],
    [22, 'evening'],
    [23, 'night'],
    [4, 'night'],
    [0, 'night'],
  ] as const)('%i:00 is %s', (hour, band) => {
    expect(greetingBandFor(hour)).toBe(band)
  })

  it('has a late band, so 23:00 is not greeted "good evening"', () => {
    // The product is used late — every reference screenshot is stamped 21:40 —
    // and an evening greeting at midnight reads as a clock that stopped.
    expect(greetingBandFor(23)).toBe('night')
    expect(greetingBandFor(2)).toBe('night')
  })

  it('still greets when the clock makes no sense', () => {
    // The caller reads a browser clock. A NaN hour must produce a greeting
    // rather than an empty heading where the screen's title goes.
    expect(greetingBandFor(Number.NaN)).toBe('evening')
    expect(greetingBandFor(Number.POSITIVE_INFINITY)).toBe('evening')
  })

  it('floors a fractional hour instead of falling through', () => {
    expect(greetingBandFor(11.9)).toBe('morning')
    expect(greetingBandFor(17.5)).toBe('afternoon')
  })
})
