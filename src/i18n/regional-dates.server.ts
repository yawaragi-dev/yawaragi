import 'server-only'
import { headers } from 'next/headers'
import { getLocale } from 'next-intl/server'
import { createDateFormatter, regionalDateLocale } from './regional-dates'

/** The locale this request's dates are formatted in (#371): the app's
 *  language with the region of the visitor's browser. */
export async function getDateLocale(locale?: string): Promise<string> {
  const appLocale = locale ?? (await getLocale())
  return regionalDateLocale(appLocale, (await headers()).get('accept-language'))
}

/** The date formatter for a server component. Numbers keep `getFormatter()`. */
export async function getDateFormatter(locale?: string) {
  return createDateFormatter(await getDateLocale(locale))
}
