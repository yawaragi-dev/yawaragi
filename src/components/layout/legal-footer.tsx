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
 * **On Account this IS §15's footer.** §15 lists the same three links, so
 * rather than printing them twice — or making this a client component to hide
 * itself on one route, which would ship the footer and its messages to the
 * browser on every app screen to answer one boolean — the Account page
 * contributes only what §15 adds: its "Drink responsibly" line. This stays the
 * single home for the links on every app screen, Account included.
 *
 * Retiring it from the *other* screens is a separate question: it trades a
 * link in the pane for two taps through the avatar, which is a judgement about
 * "unmittelbar erreichbar" and not a port decision. Tracked on #300.
 */
export async function LegalFooter() {
  const t = await getTranslations('footer')

  return (
    <footer
      className="flex flex-wrap items-center justify-end gap-4 px-5 py-4"
      data-testid="site-footer"
    >
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
    </footer>
  )
}
