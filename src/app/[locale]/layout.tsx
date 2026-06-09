import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { routing } from '@/i18n/routing'
import { Link } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import { DebugPanelMount } from '@/components/debug/debug-panel-mount'
import { CookieBanner } from '@/components/legal/cookie-banner'
import { CookieSettingsLink } from '@/components/legal/cookie-settings-link'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { getComplianceState } from '@/lib/legal/compliance-state'
import '../globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Yawaragi',
  description: 'A companion for discovering sake.',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const cookieJar = await cookies()
  // Only the GDPR `consent` field is needed here (the cookie banner is GDPR,
  // not JMStV). The age-gate / JMStV check lives in `src/proxy.ts`. The two
  // regimes stay distinct; only the cookie read is shared via the seam.
  const { consent } = getComplianceState(cookieJar)
  // ADR-0013: every feature exposes a per-request trace to the operator
  // when the `yawaragi_debug` cookie is set. The mount lives at layout
  // level so the panel persists across page navigations and reloads —
  // events accumulate in sessionStorage and survive the matched-scan
  // redirect from /scan to /sake/[brandId].
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const tFooter = await getTranslations({ locale, namespace: 'footer' })

  // ClerkProvider wraps NextIntlClientProvider so Clerk's auth context is
  // available to any client component that also needs the intl context.
  // Phase 2 renders no Clerk UI (no <SignIn/>, <SignUp/>, <UserButton/>) —
  // this is the deliberate exception to the "no half-finished" rule
  // documented in PRD #21 / issue #55. Phase 2.5+ surfaces attach here.
  return (
    <ClerkProvider>
      <html
        lang={locale}
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col bg-zinc-50 font-sans dark:bg-black">
          <NextIntlClientProvider>
            <header className="flex justify-end px-6 py-4">
              <LocaleSwitcher />
            </header>
            {children}
            <footer
              className="flex flex-wrap items-center justify-end gap-4 px-6 py-3"
              data-testid="site-footer"
            >
              <Link
                href="/imprint"
                data-testid="footer-imprint-link"
                className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                {tFooter('imprintLink')}
              </Link>
              <Link
                href="/privacy"
                data-testid="footer-privacy-link"
                className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                {tFooter('privacyLink')}
              </Link>
              <CookieSettingsLink />
            </footer>
            <CookieBanner initialDecision={consent} />
            <DebugPanelMount debugMode={debugMode} />
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
