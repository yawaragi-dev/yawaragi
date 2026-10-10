import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { CookieSettingsLink } from '@/components/legal/cookie-settings-link'
import { FooterCredit } from '@/components/layout/footer-credit'

/**
 * Impressum · Privacy notice · Cookie settings.
 *
 * Extracted from the locale layout when the app moved behind the §-spec shell,
 * because the two route groups need it in different places: `(site)` renders
 * it as a page footer in normal flow, `(app)` renders it at the end of the
 * scrolling pane.
 *
 * **It has to stay reachable from app screens.** German
 * Impressumspflicht (§5 TMG / §18 MStV) requires the Impressum to be "leicht
 * erkennbar, unmittelbar erreichbar" from every page, so this cannot simply be
 * dropped from the app while its designed home — §15 Account, with Privacy and
 * Cookie settings rows — is unbuilt. It scrolls with the content rather than
 * being fixed, so rule 11's "never put a second bar on the bottom edge" still
 * holds.
 *
 * **On Account this IS §15's footer.** §15 lists the same links, so rather
 * than printing them twice — or making this a client component to hide itself
 * on one route, which would ship the footer and its messages to the browser on
 * every app screen to answer one boolean — the Account page passes what §15
 * adds through `trailing`. This stays the single home for the links on every
 * app screen, Account included.
 *
 * **"Drink responsibly" lives here, not on the Account page.** The first
 * attempt put it there and the result was two footers: §15's line
 * left-aligned in the page, these links right-aligned below it, a gap
 * between. The maintainer called it out on sight — an orphaned line, not a
 * footer. A slot on this component would have fixed the row but not the
 * ownership, since `(app)/layout.tsx` renders the footer and a page cannot
 * pass anything into it. So the line is simply part of the footer: it is a
 * responsible-drinking statement on an alcohol-information product, and no
 * app screen's spec argues against showing it. §0 keeps its own copy, because
 * the landing footer is a separate component.
 *
 * **In the app it is v1.5's end-of-screen block** (rule 15): line 1, the
 * Sakenowa credit (`<FooterCredit />`, every screen but Account), then these
 * links. The `(site)` pages render line 2 only — the landing has its own
 * footer with the credit, and the legal pages show no catalogue data.
 */
// v1.5 rule 15, line 2: accent-700 links, 14px apart, 6px vertical padding
// (a taller tap target than the text), wrapping; no underline — the accent is
// the link cue. `whitespace-nowrap` keeps an item whole when the row wraps.
const LINK_CLASS_NAME =
  'whitespace-nowrap py-1.5 text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

export async function LegalFooter({ credit = false }: { credit?: boolean } = {}) {
  const t = await getTranslations('footer')

  return (
    // v1.5 rule 15, the end-of-screen block: last in every scrolling app
    // screen, 28px under the content (screens end with `py-6`, so 4px more
    // here), left-aligned on the content column, 12px neutral-600, no divider.
    <footer className="flex flex-col gap-1 px-5 pt-1 pb-5 text-meta leading-normal text-ash-600" data-testid="site-footer">
      {credit && <FooterCredit />}
      <nav className="flex flex-wrap items-center gap-x-3.5" aria-label={t('label')}>
        <Link href="/imprint" data-testid="footer-imprint-link" className={LINK_CLASS_NAME}>
          {t('imprintLink')}
        </Link>
        <Link href="/privacy" data-testid="footer-privacy-link" className={LINK_CLASS_NAME}>
          {t('privacyLink')}
        </Link>
        <CookieSettingsLink className={`${LINK_CLASS_NAME} cursor-pointer`} />
        {/* Not a link: it is a statement, and #162 forbids a dead destination. */}
        <span className="whitespace-nowrap py-1.5" data-testid="footer-drink-responsibly">
          {t('drinkResponsibly')}
        </span>
      </nav>
    </footer>
  )
}
