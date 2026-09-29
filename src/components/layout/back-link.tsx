'use client'

import { ArrowLeft } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from 'next/navigation'
import { hasClientHistory } from '@/lib/navigation/client-history'

/**
 * The top edge's "go back" — design v1.4 rule 11: "the **top edge** is 'where
 * am I / go back', the **bottom edge** is the tab bar."
 *
 * **A link first, a history control second.** The design drives back from a
 * history stack, which is Phase 2 (#300). What cannot wait is that the control
 * works at all: a visitor who opens `/en/imprint` from a search result has no
 * history to pop, and a button that only called `router.back()` would sit
 * there doing nothing — the dead end #162 forbids. So this renders a real
 * anchor to a stated fallback and only *upgrades* to popping history when
 * there is same-origin history to pop. Worst case it navigates somewhere
 * useful; it never does nothing.
 *
 * `fallbackHref` is an already-resolved path, not a next-intl route key: with
 * `localePrefix: 'always'` plus a typed `pathnames` manifest the caller is the
 * side that knows the locale, so it resolves with `getPathname` and hands over
 * a string. Same shape `<ScanResultCard />` uses for `sakeHref`.
 *
 * "Is there history to pop" is answered by `hasClientHistory()`, which counts
 * this session's own client-side navigations. Both ambient signals are wrong
 * here in ways that matter — `document.referrer` does not update across App
 * Router navigations, and `window.history.length` counts entries we do not
 * own — so the module counts what it can actually know. See
 * `client-history.ts`.
 */
export function BackLink({
  fallbackHref,
  label,
}: {
  /** Resolved, locale-aware path to use when there is no history to pop. */
  fallbackHref: string
  /** Accessible name — the control is an icon, so this is its only label. */
  label: string
}) {
  const router = useRouter()

  return (
    <a
      href={fallbackHref}
      aria-label={label}
      data-testid="back-link"
      onClick={(event) => {
        if (!hasClientHistory()) return
        event.preventDefault()
        router.back()
      }}
      // 44px touch target, per §4's `44px minmax(0,1fr) 44px` header grid.
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ash-600 transition-colors hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
    >
      <ArrowLeft size={20} aria-hidden="true" />
    </a>
  )
}
