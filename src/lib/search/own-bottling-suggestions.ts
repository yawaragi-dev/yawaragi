'use server'

import { auth } from '@clerk/nextjs/server'
import { hasLocale } from 'next-intl'
import { getPathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { getExpressionStore } from '@/lib/collection/get-expression-store'

/** At most this many of the visitor's own bottlings head the list (v1.9 U4). */
const MAX_OWN = 2

/**
 * The visitor's own bottlings whose name holds what they are typing in §8's
 * field (design v1.9, U4), each with the page it opens. A Server Action, not
 * part of `/api/search-suggest`: it needs the visitor's session, and API
 * routes run outside the proxy where Clerk's middleware sits. Empty for a
 * visitor who keeps no journal (ADR-0020), and on any failure — the
 * catalogue rows still show.
 */
export async function ownBottlingSuggestions(
  query: string,
  locale: string,
): Promise<{ id: string; name: string; href: string }[]> {
  const needle = query.trim().toLocaleLowerCase().slice(0, 80)
  if (needle.length < 2) return []
  try {
    if (!(await currentUserIsMaintainer())) return []
    const { userId } = await auth()
    const store = getExpressionStore()
    if (!userId || !store) return []
    const where: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
    return (await store.read(userId))
      .filter((bottling) => bottling.name.toLocaleLowerCase().includes(needle))
      .slice(0, MAX_OWN)
      .map((bottling) => ({
        id: bottling.id,
        name: bottling.name,
        href: getPathname({ locale: where, href: { pathname: '/bottling/[id]', params: { id: bottling.id } } }),
      }))
  } catch {
    return []
  }
}
