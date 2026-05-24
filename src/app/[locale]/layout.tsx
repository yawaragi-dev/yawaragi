import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { setRequestLocale } from 'next-intl/server'
import { Geist, Geist_Mono } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { routing } from '@/i18n/routing'
import { CookieBanner } from '@/components/legal/cookie-banner'
import { CookieSettingsLink } from '@/components/legal/cookie-settings-link'
import { CONSENT_COOKIE_NAME, parseConsent } from '@/lib/legal/consent'
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
  const consent = parseConsent(cookieJar.get(CONSENT_COOKIE_NAME)?.value)

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider>
          {children}
          <footer className="flex justify-end px-6 py-3">
            <CookieSettingsLink />
          </footer>
          <CookieBanner initialDecision={consent} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
