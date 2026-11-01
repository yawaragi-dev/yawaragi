import { describe, expect, it } from 'vitest'
import { createDateFormatter, regionalDateLocale } from './regional-dates'

const JULY_18 = Date.UTC(2026, 6, 18, 12)

describe('dates in the visitor\'s regional format', () => {
  it('keeps the UI language but takes the region from the browser', () => {
    expect(regionalDateLocale('en', 'de-DE,de;q=0.9,en;q=0.8')).toBe('en-DE')
    expect(regionalDateLocale('en', 'en-GB,en;q=0.9')).toBe('en-GB')
    expect(regionalDateLocale('de', 'en-US,en;q=0.9')).toBe('de-US')
  })

  it('reads a bare language as its usual region', () => {
    expect(regionalDateLocale('en', 'de')).toBe('en-DE')
    expect(regionalDateLocale('en', ['en'])).toBe('en-US')
  })

  it('takes the most preferred language, not the first written', () => {
    expect(regionalDateLocale('en', 'fr;q=0.5, en-GB;q=0.9')).toBe('en-GB')
  })

  it('falls back to the UI language when the browser says nothing usable', () => {
    expect(regionalDateLocale('en', null)).toBe('en')
    expect(regionalDateLocale('en', '')).toBe('en')
    expect(regionalDateLocale('de', '*')).toBe('de')
    expect(regionalDateLocale('en', 'not a tag!')).toBe('en')
  })

  it('writes a day in the order and with the separators of the region', () => {
    const day = (appLocale: string, acceptLanguage: string) =>
      createDateFormatter(regionalDateLocale(appLocale, acceptLanguage)).day('2026-07-18')
    expect(day('en', 'en-US')).toBe('07/18/2026')
    expect(day('en', 'en-GB')).toBe('18/07/2026')
    expect(day('en', 'de-DE')).toBe('18/07/2026')
    expect(day('de', 'de-DE')).toBe('18.07.2026')
  })

  it('shows a half-typed day as it is', () => {
    expect(createDateFormatter('en-GB').day('2026-07')).toBe('2026-07')
  })

  it('names months in the UI language', () => {
    const { dateTime } = createDateFormatter('de-DE')
    expect(dateTime(JULY_18, { day: 'numeric', month: 'short' })).toBe('18. Juli')
    expect(createDateFormatter('en-DE').dateTime(JULY_18, { day: 'numeric', month: 'short' })).toBe('18 Jul')
  })

  it('reads a date in UTC unless told otherwise, so a tasting has one day for everyone', () => {
    const lateEvening = Date.UTC(2026, 6, 18, 23, 30)
    expect(createDateFormatter('en-GB').dateTime(lateEvening, { day: '2-digit' })).toBe('18')
  })

  it('tells the time on a 12- or 24-hour clock by region', () => {
    expect(createDateFormatter('en-US').time(JULY_18)).toMatch(/^\d{2}:\d{2}\s(AM|PM)$/)
    expect(createDateFormatter('en-DE').time(JULY_18)).toMatch(/^\d{2}:\d{2}$/)
  })
})
