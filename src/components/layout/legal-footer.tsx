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
export async function LegalFooter() {
  const t = await getTranslations('footer')

  return (
    // Two rows on purpose: the links, then the statement under them. On one
    // flex-wrap row the German line ("Trinke verantwortungsvoll") did not fit
    // at 390px and dropped to a line of its own, orphaned under the links —
    // while English happened to fit. Giving the statement its own row in every
    // locale makes the layout the same whatever the translation's length.
    <footer
      className="flex flex-col items-end gap-2 px-5 py-4"
      data-testid="site-footer"
    >
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
        <Link
          href="/imprint"
          data-testid="footer-imprint-link"
          className="text-meta text-ash-600 underline underline-offset-4 hover:text-ash-800"
        >
          {t('imprintLink')}
        </Link>
        <Link
          href="/privacy"
          data-testid="footer-privacy-link"
          className="text-meta text-ash-600 underline underline-offset-4 hover:text-ash-800"
        >
          {t('privacyLink')}
        </Link>
        <CookieSettingsLink />
      </div>
      {/* Not a link: it is a statement, and #162 forbids a dead destination. */}
      <span className="text-meta text-ash-600" data-testid="footer-drink-responsibly">
        {t('drinkResponsibly')}
      </span>
    </footer>
  )
}
