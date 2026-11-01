import { createFormatter } from 'next-intl'

/**
 * Dates in the visitor's own regional format (#371).
 *
 * The UI language (`en` / `de`) and the date format are separate choices: an
 * English UI read in Germany wants the day first and a 24-hour clock. So a
 * date is formatted in the app's language *with the visitor's region*, taken
 * from their browser's first language — the `Accept-Language` header on the
 * server, `navigator.languages` offline. `en` + `de-DE` gives `en-DE`
 * (18/07/2026, 19:40); `en` + `en-US` gives `en-US` (07/18/2026, 07:40 PM);
 * `de` stays German whatever the region.
 *
 * Only the presentation follows the region. Which calendar day a tasting
 * falls on is still decided in UTC (see `tasting-day.ts`), and stored data
 * and exports are untouched.
 */

/** The browser's preferred language tags, best first, from an `Accept-Language` value. */
function preferredTags(acceptLanguage: string | readonly string[] | null | undefined): string[] {
  if (!acceptLanguage) return []
  if (typeof acceptLanguage !== 'string') return [...acceptLanguage]
  return acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';')
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean)
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q), index }
    })
    .filter((t) => t.tag && t.tag !== '*' && t.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((t) => t.tag)
}

/**
 * The locale dates are formatted in: the app's language, the visitor's
 * region. A bare language (`de`) stands for its usual region (`DE`). Anything
 * unreadable falls back to the app locale on its own.
 */
export function regionalDateLocale(
  appLocale: string,
  acceptLanguage: string | readonly string[] | null | undefined,
): string {
  const first = preferredTags(acceptLanguage)[0]
  if (!first) return appLocale
  try {
    const region = new Intl.Locale(first).maximize().region
    if (!region) return appLocale
    const locale = new Intl.Locale(appLocale, { region }).toString()
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0 ? locale : appLocale
  } catch {
    return appLocale
  }
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * next-intl's formatter, set to the regional locale, plus `day()` for a
 * tasting day. Without a `timeZone` in the call a date is read in UTC, the
 * journal's basis; a clock time passes the visitor's own zone explicitly.
 */
export function createDateFormatter(locale: string) {
  const format = createFormatter({ locale, timeZone: 'UTC' })
  return {
    dateTime: format.dateTime,
    /** `2026-07-18` as an all-numeric date: 18.07.2026, 18/07/2026 or
     *  07/18/2026. A half-typed value is shown as it is. */
    day(day: string): string {
      if (!ISO_DAY.test(day)) return day
      return format.dateTime(new Date(`${day}T00:00:00Z`), {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
      })
    },
    /** A clock time where the visitor is sitting: 19:40 or 07:40 PM. Their
     *  zone is the browser's, so only call this in the browser (after a tap,
     *  an effect, or offline), never in a server render. */
    time(at: Date | number): string {
      return format.dateTime(at, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    },
  }
}

export type DateFormatter = ReturnType<typeof createDateFormatter>
