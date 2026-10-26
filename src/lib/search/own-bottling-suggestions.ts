'use server'

import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getPathname } from '@/i18n/navigation'
import { routing, type Locale } from '@/i18n/routing'
import { resolveViewer } from '@/lib/collection/viewer'

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
    // The maintainer's own bottlings only: not the sample's, not the E2E stub's.
    const viewer = await resolveViewer(await cookies())
    if (viewer.kind !== 'own' || !viewer.canLog) return []
    const { expressions } = await viewer.read('expressions')
    const where: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale
    return expressions
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
