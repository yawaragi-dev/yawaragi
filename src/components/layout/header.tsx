import { getTranslations } from 'next-intl/server'
import { Show } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { HeaderAuth } from '@/components/auth/header-auth'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { HeaderNav, type HeaderNavMessages } from '@/components/layout/header-nav'

/**
 * Persistent global header (UX-A / #162). Rendered by the locale layout
 * above `{children}` on every `[locale]` route.
 *
 * Server component: the label strings resolve at render time via
 * `getTranslations`, then hand off to `<HeaderNav />` (client, needs
 * `usePathname` for active-state indication + the mobile sheet toggle).
 * `<LocaleSwitcher />` stays a sibling — it already owns its own client
 * boundary and its position doesn't need to know about pathname.
 */
export async function Header() {
  const t = await getTranslations('header')
  const tCommon = await getTranslations('common')
  const tSignIn = await getTranslations('signIn')

  const navMessages: HeaderNavMessages = {
    navScan: t('navScan'),
    navChat: t('navChat'),
    navProfile: t('navProfile'),
    profileBadge: t('profileBadge'),
    menuOpen: t('menuOpen'),
    primaryLabel: t('primaryLabel'),
  }

  return (
    <header
      className="border-b border-zinc-200 bg-white/70 backdrop-blur-sm dark:border-zinc-800 dark:bg-black/70"
      data-testid="site-header"
    >
      <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3">
        <Link
          href="/"
          className="text-base font-semibold tracking-tight text-zinc-900 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300"
          data-testid="header-wordmark"
          aria-label={t('wordmarkLabel')}
        >
          {tCommon('siteName')}
        </Link>
        <HeaderNav messages={navMessages} />
        <div className="ml-auto flex items-center gap-2">
          {/* Clerk v7 replaced <SignedIn> with <Show when="signed-in">; it is
              a server component, so the gate lives here and only the button
              itself crosses the client boundary. */}
          <Show when="signed-in">
            <HeaderAuth signOutLabel={tSignIn('signOut')} />
          </Show>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  )
}
