'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from '@/i18n/navigation'
import { recordClientNavigation } from '@/lib/navigation/client-history'

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
 */
export function ClientHistoryTracker() {
  const pathname = usePathname()
  const previousPathname = useRef<string | null>(null)

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
