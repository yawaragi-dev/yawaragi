import { getTranslations } from 'next-intl/server'
import { Show } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { HeaderAuth } from '@/components/auth/header-auth'
import { BackLink } from '@/components/layout/back-link'
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
 *
 * `showBack` is the first step of that arrow, opted into per route group. The
 * legal documents need it most: they sit in `(site)`, so they have no tab bar,
 * and once #303 emptied this header of its nav the wordmark was the only way
 * out — which pointed at the landing, not back. Reaching an app screen again
 * took three hops. App screens keep the tabs and do not opt in yet, because
 * rule 11's arrow is per-screen and each screen supplies its own title.
 */
interface HeaderCommonProps {
  /**
   * Whether the wordmark is a link. Pass `false` on a page the wordmark's
   * own destination already IS — with `localePrefix: 'always'`, `/` resolves
   * against the current locale, so on a locale root the link points at the
   * page you are reading. A focus stop whose activation reloads the current
   * page is not navigation, and this wordmark exists only as a way out (see
   * above); where it is not one, it is text.
   */
  linkWordmark?: boolean
}

/**
 * A union, not two optional props: `<BackLink />` is an anchor first, so it
 * cannot render without a destination — and an earlier draft that took both
 * as optional rendered NOTHING when given `showBack` alone. A control that
 * silently does nothing is the defect this whole change exists to remove, so
 * the pairing is a type error rather than a runtime shrug.
 */
type HeaderProps = HeaderCommonProps &
  (
    | {
        /** Render rule 11's back arrow left of the wordmark. */
        showBack: true
        /** Resolved path the arrow falls back to with no history to pop. */
        backFallbackHref: string
      }
    | { showBack?: false; backFallbackHref?: never }
  )

export async function Header(props: HeaderProps = {}) {
  const { linkWordmark = true } = props
  const t = await getTranslations('header')
  const tCommon = await getTranslations('common')
  const tSignIn = await getTranslations('signIn')

  return (
    <header
      className="flex-none border-b border-divider bg-surface"
      data-testid="site-header"
    >
      <div className="flex items-center gap-3 px-5 py-3 sm:gap-4">
        {props.showBack && (
          // `-ml-3` pulls the 44px touch target back by its own padding so the
          // arrow's glyph — not the edge of its hit area — lines up with the
          // 20px gutter the wordmark uses. The target itself stays 44px.
          <span className="-ml-3 flex">
            <BackLink fallbackHref={props.backFallbackHref} label={t('backLabel')} />
          </span>
        )}
        {linkWordmark ? (
          <Link
            href="/"
            className="text-card-heading font-medium text-ink hover:text-ash-800"
            data-testid="header-wordmark"
            aria-label={t('wordmarkLabel')}
          >
            {tCommon('siteName')}
          </Link>
        ) : (
          <span
            className="text-card-heading font-medium text-ink"
            data-testid="header-wordmark"
          >
            {tCommon('siteName')}
          </span>
        )}
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
