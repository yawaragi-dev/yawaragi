import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { CookieSettingsLink } from '@/components/legal/cookie-settings-link'

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
 * Still not §15's row: the prototype makes it a left-aligned 11px line with
 * `·` separators, and "Terms" has no route yet. Restyling the app-wide footer
 * to one screen's spec is the §15 full port's job, not this slice's — the
 * whole reason this component still exists on app screens is that it is
 * interim chrome. Tracked on #300.
 *
 * Retiring it from the *other* screens is a separate question: it trades a
 * link in the pane for two taps through the avatar, which is a judgement about
 * "unmittelbar erreichbar" and not a port decision. Also #300.
 */
// Left-aligned, on the content column like everything above it: pushed to
// the right edge it read as misaligned under left-aligned screens.
// 11px, as §15's footer line is in the prototype, and inherited by every item
// so the four stay one size. 12px plus the German labels was ~400px of text
// for a 350px row: "Trinke verantwortungsvoll" wrapped onto a line of its own.
// At 11px, with the German cookie link shortened to "Cookies", both locales
// fit one row at 390px. `whitespace-nowrap` keeps an item whole if a narrower
// screen does force a wrap.
const LINK_CLASS_NAME =
  'whitespace-nowrap text-ash-600 underline underline-offset-4 hover:text-ash-800'

export async function LegalFooter() {
  const t = await getTranslations('footer')

  return (
    <footer
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4 text-[11px] leading-normal"
      data-testid="site-footer"
    >
      <Link href="/imprint" data-testid="footer-imprint-link" className={LINK_CLASS_NAME}>
        {t('imprintLink')}
      </Link>
      <Link href="/privacy" data-testid="footer-privacy-link" className={LINK_CLASS_NAME}>
        {t('privacyLink')}
      </Link>
      <CookieSettingsLink className={`${LINK_CLASS_NAME} cursor-pointer`} />
      {/* Not a link: it is a statement, and #162 forbids a dead destination. */}
      <span className="whitespace-nowrap text-ash-600" data-testid="footer-drink-responsibly">
        {t('drinkResponsibly')}
      </span>
    </footer>
  )
}
