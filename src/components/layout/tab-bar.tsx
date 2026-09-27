'use client'

import { Camera, Hexagon, House, Notebook } from '@phosphor-icons/react/dist/ssr'
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
      {TABS.map(({ href, icon: Icon, labelKey, testId }) => {
        const active = isTabActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-testid={testId}
            data-active={active ? 'true' : undefined}
            // min-h-11 is the design's 44px floor for a touch target.
            className={cn(
              'flex min-h-11 flex-col items-center gap-1 py-1.5 text-micro transition-colors',
              active ? 'text-ginshu-600' : 'text-ash-600 hover:text-ash-800',
            )}
          >
            <Icon
              size={22}
              // Fill weight reads as "you are here" at 22px far better than a
              // colour change alone, which is the whole reason the design
              // specifies two weights rather than one.
              weight={active ? 'fill' : 'regular'}
              aria-hidden="true"
            />
            {messages[labelKey]}
          </Link>
        )
      })}
    </nav>
  )
}
