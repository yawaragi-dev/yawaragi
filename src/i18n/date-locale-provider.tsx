'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocale } from 'next-intl'
import { createDateFormatter } from './regional-dates'

const DateLocaleContext = createContext<string | null>(null)

/**
 * Hands client components the date locale the server worked out from the
 * request, so a date rendered on the server and hydrated in the browser is
 * the same string (#371). Context is the reason this is a client file.
 */
export function DateLocaleProvider({ locale, children }: { locale: string; children: ReactNode }) {
  return <DateLocaleContext.Provider value={locale}>{children}</DateLocaleContext.Provider>
}

/** The regional date locale; `appLocale` outside a provider. For components
 *  that are handed their locale rather than reading next-intl's. */
export function useDateLocale(appLocale: string): string {
  return useContext(DateLocaleContext) ?? appLocale
}

/** The date formatter for a client component. */
export function useDateFormatter() {
  const locale = useDateLocale(useLocale())
  return useMemo(() => createDateFormatter(locale), [locale])
}
