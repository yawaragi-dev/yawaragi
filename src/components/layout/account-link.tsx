'use client'

import { UserCircle } from '@phosphor-icons/react/dist/ssr'
import { Link, usePathname } from '@/i18n/navigation'

/**
 * §15's Account entry in the header — "at the top right of Home, Collection
 * and Palate".
 *
 * A client component for one reason: it has to know when it is pointing at the
 * page you are already reading. `<Header />` lives in `(app)/layout.tsx`,
 * which Next gives no pathname, so the check cannot happen there. `<TabBar />`
 * already pays the same cost for the same reason, and marks its active item
 * the same way.
 *
 * It stays a link when active, unlike the wordmark: this is a navigation item
 * like a tab, and an active tab that goes dead is more surprising than one
 * that re-enters its own route. What it must not do is claim to be a way
 * somewhere else, so `aria-current="page"` says so — the header's only other
 * self-pointing control, the wordmark, is rendered as text instead because its
 * whole job is to be an exit rather than a destination.
 */
export function AccountLink({ label }: { label: string }) {
  const pathname = usePathname()
  const isActive = pathname === '/account'

  return (
    <Link
      href="/account"
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      data-testid="header-account-link"
      className="inline-flex size-11 items-center justify-center rounded-md text-ash-600 transition-colors hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 aria-[current=page]:text-ink"
    >
      {/* §15 draws an avatar. There is no avatar to draw for a visitor with no
          account — which is most of them, by design — so the glyph stands in
          until identity exists to show. */}
      <UserCircle size={24} aria-hidden="true" />
    </Link>
  )
}
