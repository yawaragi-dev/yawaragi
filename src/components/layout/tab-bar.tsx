'use client'

import type { Icon } from '@phosphor-icons/react'
import { Camera, Hexagon, House, Notebook } from '@phosphor-icons/react/dist/ssr'
import { useLinkStatus } from 'next/link'
import { Link, usePathname } from '@/i18n/navigation'
import { cn } from '@/lib/utils'

/**
 * The app's bottom tab bar — design v1.4 § "App structure" and rule 11.
 *
 * One rule governs the whole shell: **the top edge is "where am I / go back",
 * the bottom edge is the tab bar.** So this is the only thing that ever sits
 * on the bottom edge; screen-level actions go in the content, never in a
 * second bar (rule 11), and sheets cover it rather than displacing it.
 *
 * Four tabs, and the icons are the prototype's: house · camera · notebook ·
 * hexagon, switching to Phosphor's fill weight when active. The hexagon is the
 * Palate's six-axis chart in miniature, which is why it isn't a chart glyph.
 *
 * Client component for `usePathname()` — the active tab has to be known on
 * the client because the bar persists across navigations inside the shell.
 */

const TABS = [
  { href: '/home', icon: House, labelKey: 'home', testId: 'tab-home' },
  { href: '/scan', icon: Camera, labelKey: 'scan', testId: 'tab-scan' },
  { href: '/collection', icon: Notebook, labelKey: 'collection', testId: 'tab-collection' },
  // Palate's route is still `/profile`: the design renames the *tab*, and
  // renaming the URL belongs to §12's port, not the shell's. The label the
  // visitor reads is already "Palate".
  { href: '/profile', icon: Hexagon, labelKey: 'palate', testId: 'tab-palate' },
] as const

type TabLabelKey = (typeof TABS)[number]['labelKey']

export type TabBarMessages = Record<TabLabelKey, string> & { navLabel: string }

interface TabBarProps {
  messages: TabBarMessages
}

/**
 * A tab is active on its own screen and on anything nested under it.
 *
 * The design goes further — "the tab you came from stays highlighted on
 * screens you open from it; after a scan that's Scan" — which needs the
 * history stack rule 11 describes. A bottle page reached from Scan and one
 * reached from Collection are the same URL, so no amount of path matching can
 * tell them apart. Until that stack exists, screens outside every tab's
 * subtree (`/sake/[brandId]`, `/suggest`) highlight nothing rather than
 * highlighting something wrong. Tracked on #300.
 */
export function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function TabBar({ messages }: TabBarProps) {
  const pathname = usePathname()

  return (
    <nav
      aria-label={messages.navLabel}
      // `pb-6` is the prototype's 24px bottom padding: it keeps the labels
      // clear of the iOS home indicator. `flex-none` so the bar never
      // compresses when the pane above it is full.
      className="flex-none grid grid-cols-4 border-t border-divider bg-surface px-1.5 pt-2.5 pb-6"
      data-testid="tab-bar"
    >
      {TABS.map(({ href, icon, labelKey, testId }) => (
        <Link
          key={href}
          href={href}
          aria-current={isTabActive(pathname, href) ? 'page' : undefined}
          data-testid={testId}
          className="flex min-h-11 flex-col items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        >
          <TabContents
            icon={icon}
            label={messages[labelKey]}
            active={isTabActive(pathname, href)}
          />
        </Link>
      ))}
    </nav>
  )
}

interface TabContentsProps {
  icon: Icon
  label: string
  active: boolean
}

/**
 * The icon and label, inside the `<Link>` so it can read `useLinkStatus()`.
 *
 * **A tab lights up the moment it is tapped, not when the route arrives.**
 * `/profile` does database work and neither placeholder route is prefetched
 * on a cold tap, so without this a visitor taps Collection and nothing at all
 * happens for as long as the server takes — the exact no-feedback failure
 * #184 was filed for, and question 1 of the UX pre-flight checklist.
 *
 * The acknowledgement is the accent colour arriving early rather than a
 * spinner: it is what a native tab bar does, it needs no string (so nothing
 * to translate, nothing to mistime), and if the navigation is instant the
 * visitor cannot tell the difference. `aria-current` still only appears once
 * the visitor is genuinely there — a pending tab must not announce itself as
 * the current page.
 */
function TabContents({ icon: Icon, label, active }: TabContentsProps) {
  const { pending } = useLinkStatus()
  const lit = active || pending

  return (
    <span
      className={cn(
        'flex flex-col items-center gap-1 py-1.5 text-micro transition-colors',
        lit ? 'text-ginshu-600' : 'text-ash-600 hover:text-ash-800',
      )}
      data-active={lit ? 'true' : undefined}
    >
      <Icon
        size={22}
        // Fill weight reads as "you are here" at 22px far better than a colour
        // change alone, which is why the design specifies two weights.
        weight={lit ? 'fill' : 'regular'}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}
