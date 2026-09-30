import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'

/**
 * The landing page's own header — design v1.4 §0.
 *
 * Separate from `<Header />` because the landing sits outside the app shell
 * and advertises rather than navigates: wordmark with the kanji beside it, the
 * locale switch, and one button into the product. No tabs, no back arrow.
 */
export async function LandingHeader() {
  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')

  return (
    <header
      className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-4 px-5 py-[18px] sm:px-[clamp(20px,5vw,56px)]"
      data-testid="landing-header"
    >
      <Link
        href="/"
        className="flex items-baseline gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="landing-wordmark"
      >
        <span className="text-md-alt font-medium text-ink">{tCommon('siteName')}</span>
        {/* Part of the name, not a translated string — verbatim in every locale. */}
        <span className="text-subtle text-ash-600" lang="ja">
          和らぎ
        </span>
      </Link>
      <div className="ml-auto flex items-center gap-4">
        <LocaleSwitcher />
        {/*
          §0 sends this at the app, and the app's front door is §3 Home — but
          §3 is not ported, so `/home` renders `<TabPlaceholder />`: "Your home
          screen is on its way… the camera is the place to start", above a
          "Scan a label" link. Pointing the landing's only returning-visitor
          affordance at a screen whose own content is an apology and a link
          onward is worse than sending them where that link goes. `/scan` is
          the app's one finished screen.

          This makes §0's three CTAs share one destination: the hero's "Scan
          your first label" already went here. That is not a collision to
          resolve — the header and the privacy card carry the SAME label
          ("Open the app") and are one affordance placed twice, and the thing
          that would distinguish them from the hero is §3 itself.

          Reverts to `/home` when §3 lands. Tracked on #300.
        */}
        <Link
          href="/scan"
          className="inline-flex h-[38px] items-center rounded-lg bg-ash-200 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="landing-open-app"
        >
          {t('openApp')}
        </Link>
      </div>
    </header>
  )
}
