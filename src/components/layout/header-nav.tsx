'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * Nav backbone rendered by `<Header />`. Client component because active-
 * state indication reads `usePathname()` — the pathname value can't be
 * threaded from server without a middleware header, and the whole nav is
 * already interactive (mobile sheet toggle), so a client boundary here is
 * cheap.
 *
 * Chat → `/suggest` per issue #162: the "Chat" surface IS the Phase 4
 * suggest surface; NEVER add a `/chat` route.
 *
 * Taste Profile → `/profile` and carries a short "coming soon" badge —
 * the route exists (UX-D #165) but the real feature is Phase 5.
 */

const NAV_ITEMS = [
  { href: '/scan', labelKey: 'navScan', testId: 'header-nav-scan' },
  { href: '/suggest', labelKey: 'navChat', testId: 'header-nav-chat' },
  {
    href: '/profile',
    labelKey: 'navProfile',
    testId: 'header-nav-profile',
    badgeKey: 'profileBadge',
  },
] as const

type NavItem = (typeof NAV_ITEMS)[number]
type LabelKey = NavItem['labelKey']
type BadgeKey = Extract<NavItem, { badgeKey: string }>['badgeKey']

export type HeaderNavMessages = Record<LabelKey | BadgeKey, string> & {
  menuOpen: string
  primaryLabel: string
}

interface HeaderNavProps {
  messages: HeaderNavMessages
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function HeaderNav({ messages }: HeaderNavProps) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      <nav
        aria-label={messages.primaryLabel}
        className="hidden md:flex items-center gap-6 text-sm"
        data-testid="header-nav-desktop"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            messages={messages}
          />
        ))}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              data-testid="header-menu-trigger"
              aria-label={messages.menuOpen}
            />
          }
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="right" className="p-6">
          {/* SheetTitle is sr-only — the visible chrome (close button
              at top-right, list of nav items) is self-explanatory; a
              rendered heading would double up. Present in the DOM so
              base-ui's Dialog primitive gets its labelled title
              (a11y contract). */}
          <SheetTitle className="sr-only">{messages.primaryLabel}</SheetTitle>
          <nav
            aria-label={messages.primaryLabel}
            className="mt-8 flex flex-col gap-3 text-base"
            data-testid="header-nav-mobile"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                messages={messages}
                variant="mobile"
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

interface NavLinkProps {
  item: NavItem
  active: boolean
  messages: HeaderNavMessages
  variant?: 'desktop' | 'mobile'
  onNavigate?: () => void
}

function NavLink({ item, active, messages, variant = 'desktop', onNavigate }: NavLinkProps) {
  const label = messages[item.labelKey]
  const badge = 'badgeKey' in item ? messages[item.badgeKey] : undefined
  const testId = variant === 'mobile' ? `${item.testId}-mobile` : item.testId

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      data-testid={testId}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-2 py-1 transition-colors',
        active
          ? 'text-zinc-900 font-medium dark:text-zinc-50'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50',
      )}
    >
      {label}
      {badge && (
        <span
          className="rounded-full bg-zinc-200 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          data-testid={`${item.testId}-badge`}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
