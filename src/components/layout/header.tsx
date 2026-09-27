import { getTranslations } from 'next-intl/server'
import { Show } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { HeaderAuth } from '@/components/auth/header-auth'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'

/**
 * The top edge — design v1.4 rule 11: "the **top edge** is 'where am I / go
 * back', the **bottom edge** is the tab bar."
 *
 * This used to carry the three-item nav backbone from #162 (Scan · Chat ·
 * Taste Profile, plus a mobile sheet). `<TabBar />` is that backbone now, so
 * the nav items and the sheet are gone — two navigation systems on one screen
 * is worse than either alone, and the design gives the bottom edge the job.
 *
 * What stays, and why it isn't yet the design's per-screen header:
 *
 * - The **locale switch**, because ADR-0007 requires one in the header and its
 *   designed home is §15 Account, which is not built. It moves there with §15.
 * - The **wordmark**, as the route back out of a screen. The design replaces
 *   this with a per-screen back arrow driven by the history stack rule 11
 *   describes; that lands with the screens themselves, since each one supplies
 *   its own title.
 * - **Sign-out**, the only Clerk surface besides `/sign-in` (ADR-0020).
 *
 * Both deviations are deliberate and tracked on #300. Removing the switch to
 * chase the design sooner would breach ADR-0007; removing the wordmark before
 * back arrows exist would leave screens with no way out but the tabs.
 */
export async function Header() {
  const t = await getTranslations('header')
  const tCommon = await getTranslations('common')
  const tSignIn = await getTranslations('signIn')

  return (
    <header
      className="flex-none border-b border-divider bg-surface"
      data-testid="site-header"
    >
      <div className="flex items-center gap-3 px-5 py-3 sm:gap-4">
        <Link
          href="/"
          className="text-card-heading font-medium text-ink hover:text-ash-800"
          data-testid="header-wordmark"
          aria-label={t('wordmarkLabel')}
        >
          {tCommon('siteName')}
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {/* Clerk v7 replaced <SignedIn> with <Show when="signed-in">; it is
              a server component, so the gate lives here and only the button
              itself crosses the client boundary. */}
          <Show when="signed-in">
            <HeaderAuth
              signOutLabel={tSignIn('signOut')}
              signingOutLabel={tSignIn('signingOut')}
            />
          </Show>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
  )
}
