'use client'

import { usePathname } from '@/i18n/navigation'
import { BackLink } from './back-link'

/**
 * Rule 11's back arrow, decided per screen — design v1.4:
 *
 * > Tab main screens (Home, Scan, Collection, Palate) have no back button.
 * > Every other screen has a back arrow top-left that returns to the
 * > **previous screen**, using a history stack.
 *
 * The arrow is a property of the *screen*, but the header that holds it is a
 * property of the *shell* — one `<Header />` in `(app)/layout.tsx` serves
 * every screen under it, and a layout cannot read the pathname. Hence a
 * client component: it is the smallest piece that has to know where it is,
 * and `<BackLink />` (the control itself) stays shared with `(site)`.
 *
 * Why this is a deny-list of four rather than an allow-list: the rule is
 * phrased that way ("every other screen"), and an allow-list would silently
 * strand each new screen with no way out until someone remembered to add it —
 * which is how `/sake/[brandId]` ended up with no back affordance at all.
 *
 * Matching is exact, not prefix. `/sake/[brandId]/similar` sits under no tab
 * and gets an arrow; so would a future `/collection/cellar`, which is a screen
 * you open FROM Collection rather than Collection itself.
 */
const TAB_MAIN_SCREENS: readonly string[] = ['/home', '/scan', '/collection', '/profile']

export function ShellBackLink({
  fallbackHref,
  label,
}: {
  fallbackHref: string
  label: string
}) {
  const pathname = usePathname()
  if (TAB_MAIN_SCREENS.includes(pathname)) return null

  // `-ml-3` pulls the 44px touch target back by its own padding so the
  // arrow's glyph — not the edge of its hit area — lines up with the gutter
  // the wordmark uses. Inside this component rather than around it, so a tab
  // main screen renders no empty box for the header's `gap-3` to space out.
  return (
    <span className="-ml-3 flex">
      <BackLink fallbackHref={fallbackHref} label={label} />
    </span>
  )
}

/** Exported for the unit test — the rule, without React. */
export function shouldShowBackArrow(pathname: string): boolean {
  return !TAB_MAIN_SCREENS.includes(pathname)
}
