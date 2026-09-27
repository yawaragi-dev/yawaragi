import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { CookieSettingsLink } from '@/components/legal/cookie-settings-link'

/**
 * The landing page's footer — design v1.4 §0.
 *
 * Richer than `<LegalFooter />`: it carries the Sakenowa credit and the
 * responsible-drinking line, which belong on the public page rather than on
 * every app screen.
 *
 * Two of §0's five nav items are not links here:
 *
 * - **Terms** — there is no Terms page, and #162's rule is that an advertised
 *   destination is a real one, so it is absent rather than dead.
 * - **Drink responsibly** — `<a href="#">` in the prototype, i.e. a
 *   placeholder. It reads as a statement rather than a destination and is
 *   rendered as text; picking a real target (BZgA "Kenn dein Limit", say) is a
 *   content decision, and a fabricated one would be worse than none. See #293.
 *
 * The Sakenowa credit here does NOT satisfy the attribution rule — CLAUDE.md
 * is explicit that footer attribution is not sufficient. `<SakenowaAttribution />`
 * still goes next to the data on every surface that shows it. This is the
 * licence credit, in addition.
 */
export async function LandingFooter() {
  const t = await getTranslations('landing.footer')
  const tFooter = await getTranslations('footer')

  return (
    <footer className="border-t border-divider" data-testid="landing-footer">
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-[22px] gap-y-3.5 px-5 pt-[22px] pb-[30px] text-meta text-ash-600 sm:px-[clamp(20px,5vw,56px)]">
        <span className="min-w-[200px] flex-1">
          {t('copyright')}{' '}
          <a
            href="https://sakenowa.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-sm underline underline-offset-4 hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="landing-sakenowa-credit"
          >
            {t('poweredBySakenowa')}
          </a>
        </span>
        <nav className="flex flex-wrap items-center gap-4">
          <Link
            href="/imprint"
            className="rounded-sm underline underline-offset-4 hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="footer-imprint-link"
          >
            {tFooter('imprintLink')}
          </Link>
          <Link
            href="/privacy"
            className="rounded-sm underline underline-offset-4 hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="footer-privacy-link"
          >
            {tFooter('privacyLink')}
          </Link>
          <CookieSettingsLink />
          <span data-testid="landing-drink-responsibly">{t('drinkResponsibly')}</span>
        </nav>
      </div>
    </footer>
  )
}
