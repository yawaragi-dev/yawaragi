import { hasLocale } from 'next-intl'
import { Header } from '@/components/layout/header'
import { LegalFooter } from '@/components/layout/legal-footer'
import { getPathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * The legal documents and the age-gate rejection screen.
 *
 * Split out of `(site)` once the landing grew its own §0 header and footer:
 * these pages still want the plain app chrome, and the landing must not get
 * both sets. Nested route group, so the URLs are untouched.
 *
 * **These are the pages that most need rule 11's back arrow.** They sit in
 * `(site)`, so there is no tab bar, and once #303 emptied the header of its
 * nav the wordmark was the only way out — and it points at the landing, not
 * back where you came from. Getting to an app screen again took landing →
 * "Open the app" → `/home`, three hops through a placeholder. The arrow falls
 * back to the landing for a cold deep-link, which is where a visitor arriving
 * from a search result should go anyway.
 */
export default async function SiteChromeLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const resolvedLocale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale

  return (
    <>
      <Header showBack backFallbackHref={getPathname({ locale: resolvedLocale, href: '/' })} />
      {children}
      <LegalFooter />
    </>
  )
}
