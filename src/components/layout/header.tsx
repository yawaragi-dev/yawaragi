import { getTranslations } from 'next-intl/server'
import { Show } from '@clerk/nextjs'
import { Link } from '@/i18n/navigation'
import { HeaderAuth } from '@/components/auth/header-auth'
import { AccountLink } from '@/components/layout/account-link'
import { BackLink } from '@/components/layout/back-link'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { ShellBackLink } from '@/components/layout/shell-back-link'

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
 * - The **locale switch**, and only until `de` launches. ADR-0007's
 *   2026-09-30 amendment makes §15 Account's Language row its canonical home
 *   and this one interim: §15 marks that row "not tappable until DACH
 *   launch", so removing this before the row is a control would leave the app
 *   with no locale affordance at all. When `de` joins `LAUNCHED_LOCALES` the
 *   row becomes real and this goes, in the same PR. Do not tidy it away
 *   sooner.
 * - The **wordmark**, as the route back out of a screen. The design replaces
 *   this with a per-screen back arrow driven by the history stack rule 11
 *   describes; that lands with the screens themselves, since each one supplies
 *   its own title.
 * - **Sign-out**, the only Clerk surface besides `/sign-in` (ADR-0020).
 *
 * Both deviations are deliberate and tracked on #300. Removing the switch to
 * chase the design sooner would leave no locale affordance; removing the
 * wordmark before
 * back arrows exist would leave screens with no way out but the tabs.
 *
 * `showBack` carries that arrow. `true` renders it unconditionally, which is
 * what `(site)` wants: the legal documents have no tab bar, so once #303
 * emptied this header of its nav the wordmark was the only way out — and it
 * pointed at the landing, not back.
 *
 * `'auto'` is rule 11 itself, and is what the app shell passes: an arrow on
 * every screen except the four tab main screens. It is a separate mode rather
 * than the default because `(site)` has no tabs for the rule to except, and
 * because a `(site)` page asking for an arrow is stating a fact about itself,
 * not delegating to the pathname. See `<ShellBackLink />`.
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
  /**
   * Render §15's Account entry. App screens only: §15 puts it "at the top
   * right of Home, Collection and Palate", and it is what makes the design's
   * "avatar → Impressum is 2 taps" true.
   */
  showAccount?: boolean
}

/**
 * A union, not two optional props: `<BackLink />` is an anchor first, so it
 * cannot render without a destination — and an earlier draft that took both
 * as optional rendered NOTHING when given `showBack` alone. A control that
 * silently does nothing is the defect that arrow exists to remove, so the
 * pairing is a type error rather than a runtime shrug.
 *
 * `showAccount` is NOT in the union: it needs no companion, and §15's entry
 * and rule 11's arrow are independent — a screen can want either, both or
 * neither.
 */
type HeaderProps = HeaderCommonProps &
  (
    | {
        /**
         * Render rule 11's back arrow left of the wordmark. `true` always;
         * `'auto'` on every screen but the four tab main screens.
         */
        showBack: true | 'auto'
        /** Resolved path the arrow falls back to with no history to pop. */
        backFallbackHref: string
      }
    | { showBack?: false; backFallbackHref?: never }
  )

export async function Header(props: HeaderProps = {}) {
  const { linkWordmark = true, showAccount = false } = props
  const t = await getTranslations('header')
  const tCommon = await getTranslations('common')
  const tSignIn = await getTranslations('signIn')

  return (
    <header
      className="flex-none border-b border-divider bg-surface"
      data-testid="site-header"
    >
      <div className="flex items-center gap-3 px-5 py-3 sm:gap-4">
        {props.showBack === 'auto' ? (
          <ShellBackLink fallbackHref={props.backFallbackHref} label={t('backLabel')} />
        ) : (
          props.showBack && (
            // `-ml-3` pulls the 44px touch target back by its own padding so
            // the arrow's glyph — not the edge of its hit area — lines up with
            // the 20px gutter the wordmark uses. The target stays 44px.
            <span className="-ml-3 flex">
              <BackLink fallbackHref={props.backFallbackHref} label={t('backLabel')} />
            </span>
          )
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
          {showAccount && <AccountLink label={t('accountLabel')} />}
        </div>
      </div>
    </header>
  )
}
