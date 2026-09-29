'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { usePathname } from '@/i18n/navigation'
import { noteLocale, recordClientNavigation } from '@/lib/navigation/client-history'

/**
 * Counts this session's client-side navigations so `<BackLink />` knows
 * whether there is an in-app page behind the visitor.
 *
 * Renders nothing. Mounted once in the locale layout so it spans both route
 * groups — the whole point is to notice a move from `(app)` into `(site)`,
 * which is how a visitor reaches the legal documents and loses the tab bar.
 *
 * The first pathname it sees is the entry point, not a navigation: that page
 * was reached by a document load, and there is nothing of ours behind it. Only
 * subsequent changes count, and each one is compared against the *previous*
 * path rather than the entry path — otherwise navigating back to where you
 * started would read as "no move" and lose a real history entry. See
 * `client-history.ts` for why an in-memory count beats `document.referrer` and
 * `window.history.length`.
 *
 * **A locale switch does not add to the count — it CLEARS it.** Reported in
 * review: from `/en`, tap Imprint, switch to Deutsch, tap back, and you landed
 * on `/en` right after choosing German. The switch uses `router.replace`, so
 * `/de/Impressum` took `/en/imprint`'s slot and the entry behind it is the
 * document-load page — honest history, wrong answer, because every page
 * behind the visitor is now in the locale they just left. `noteLocale` clears
 * the count so `<BackLink />`'s fallback, which resolves in the new locale,
 * takes over. Two effects rather than one because the pathname effect cannot
 * see it: the layout re-mounts across a locale change, so its ref reads the
 * new locale's first pathname as an entry point.
 */
export function ClientHistoryTracker() {
  const locale = useLocale()
  const pathname = usePathname()
  const previousPathname = useRef<string | null>(null)

  useEffect(() => {
    noteLocale(locale)
  }, [locale])

  useEffect(() => {
    if (previousPathname.current === null) {
      previousPathname.current = pathname
      return
    }
    if (previousPathname.current !== pathname) {
      previousPathname.current = pathname
      recordClientNavigation()
    }
  }, [pathname])

  return null
}
