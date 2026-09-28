'use client'

import { useTranslations } from 'next-intl'
import { Link, usePathname } from '@/i18n/navigation'
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
 * **Except on Account**, which carries §15's own footer — the same links, one
 * screen, printed twice. §15 is where these belong and where they will
 * eventually live alone; removing the in-pane copy from every *other* screen
 * is a legal judgement about whether two taps still counts as "unmittelbar
 * erreichbar", and not one a port PR should make. Hiding it on the one screen
 * that demonstrably duplicates it costs no reachability at all.
 *
 * Client component only for that check. It renders nothing else dynamic, and
 * `usePathname` resolves during SSR, so the markup is correct on first paint
 * rather than flashing a second footer and removing it.
 */
export function LegalFooter() {
  const t = useTranslations('footer')
  const pathname = usePathname()

  if (pathname === '/account') return null

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
