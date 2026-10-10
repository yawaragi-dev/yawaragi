import type { ReactNode } from 'react'
import { getLocale, getTranslations } from 'next-intl/server'
import { getPathname } from '@/i18n/navigation'
import { AccountLink } from '@/components/layout/account-link'
import { BackLink } from '@/components/layout/back-link'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'

/**
 * v1.5's header rule (App structure → Headers). There is no shared shell
 * header in the app any more — each screen owns its top:
 *
 * - **Tab main screens** (Home, Collection, Palate) use {@link TabHeader}: the
 *   screen's title, and at the right the avatar (§15 opens from it) plus the
 *   interim EN/DE pair while `de` is not launched (ADR-0007).
 * - **Every other screen** uses {@link ScreenBar}: back · title or kicker · at
 *   most one ghost action. Never Sign out — it lives only on §15.
 * - Scan, its result and outcome screens, and Search have their own top rows.
 *
 * The wordmark goes: the tab bar and the screen's own title say where you are.
 */

/** A tab main screen's top: its title (the caller's markup) beside the avatar. */
export async function TabHeader({ children }: { children: ReactNode }) {
  const t = await getTranslations('header')
  return (
    <header className="flex items-start justify-between gap-3" data-testid="site-header">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex shrink-0 items-center gap-2 pt-1">
        <LocaleSwitcher />
        <AccountLink label={t('accountLabel')} />
      </div>
    </header>
  )
}

/** Any other screen's top bar: back · title · one optional ghost action. */
export async function ScreenBar({
  title,
  titleAs: Title = 'span',
  backFallbackHref,
  action,
}: {
  title: string
  /** `h1` when the screen has no heading of its own (Similar, Account). */
  titleAs?: 'h1' | 'span'
  /**
   * Where back goes when there is no history to pop (a cold deep link).
   * Resolved, locale-aware; defaults to Home, the app's front door.
   */
  backFallbackHref?: string
  action?: ReactNode
}) {
  const t = await getTranslations('header')
  const fallback = backFallbackHref ?? getPathname({ locale: await getLocale(), href: '/home' })
  return (
    <header className="-mx-2 flex min-h-11 items-center gap-1" data-testid="screen-bar">
      <BackLink fallbackHref={fallback} label={t('backLabel')} />
      <Title className="min-w-0 flex-1 truncate text-card-heading font-medium text-ink" data-testid="screen-bar-title">
        {title}
      </Title>
      {action}
    </header>
  )
}
