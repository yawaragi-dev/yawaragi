import { cookies } from 'next/headers'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Geist_Mono, Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { routing } from '@/i18n/routing'
import { DebugPanelMount } from '@/components/debug/debug-panel-mount'
import { buildClerkLocalization } from '@/lib/auth/clerk-localization'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import '../globals.css'

// Inter, per the design's type section. `--font-inter` is what `--font-sans`
// resolves to in globals.css. Geist Mono stays for the debug panel's numbers.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })
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
  // ADR-0013: every feature exposes a per-request trace to the operator
  // when the `yawaragi_debug` cookie is set. The mount lives at layout
  // level so the panel persists across page navigations and reloads —
  // events accumulate in sessionStorage and survive the matched-scan
  // redirect from /scan to /sake/[brandId].
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  const tSignIn = await getTranslations({ locale, namespace: 'signIn' })

  // ClerkProvider wraps NextIntlClientProvider so Clerk's auth context is
  // available to any client component that also needs the intl context.
  //
  // Phase 2 deliberately rendered NO Clerk UI (PRD #21 / issue #55). Phase 5.5
  // ended that: the tasting journal gates on `auth().userId`, so a session had
  // to become obtainable. The app now renders exactly two Clerk surfaces —
  // `<SignIn/>` on `/[locale]/sign-in` and a sign-out control in the header.
  // Still NO `<SignUp/>`: ADR-0020 keeps v1 a maintainer-only private beta
  // with no public account creation.
  return (
    <ClerkProvider
      // Clerk's widgets ship English copy; localisation is applied at the
      // provider, not per widget. Sourcing it from our own catalogue keeps
      // the German in `messages/de.json` — see `clerk-localization.ts`.
      localization={buildClerkLocalization({
        cardTitle: tSignIn('cardTitle'),
        cardSubtitle: tSignIn('cardSubtitle'),
        emailLabel: tSignIn('emailLabel'),
        passwordLabel: tSignIn('passwordLabel'),
        submit: tSignIn('submit'),
      })}
    >
      <html
        lang={locale}
        // `overflow-x-clip` (not `-hidden`) is load-bearing on both
        // html and body to defend against horizontal-scroll bugs from
        // descendants. The sake page's `<ProvenanceBadge />` mounts an
        // always-rendered tooltip (`<span absolute left-0 w-max
        // max-w-xs>`) that's hidden via `opacity-0` but stays in the
        // DOM layout, so when a badge sits near the right edge the
        // tooltip's 20rem max-width extends past the viewport. The
        // scan page's `<input type="file" class="sr-only">` has the
        // same shape on iOS Safari (file-input button text leaks at
        // its intrinsic ~191px width despite sr-only's clip:rect).
        // Both push `document.scrollWidth` past viewport, and every
        // `fixed inset-x-0` element (debug panel, cookie banner) then
        // appears to "extend past the right edge".
        //
        // `clip` over `hidden`: `hidden` creates a scroll container
        // and on iOS Safari that interacts badly with scroll-
        // restoration on history-back. `clip` clips without
        // establishing a scroll container — exactly what we want for
        // an x-overflow defense. Setting it on BOTH html and body
        // because iOS Safari has cases where body's overflow-x
        // doesn't propagate up unless html agrees.
        //
        // (Reported 2026-06-14: "debug panel too wide" on mobile
        // preview, triggered by navigating to /sake/[brandId]. The
        // panel itself measured viewport-width on Chromium repros;
        // the document was overflowing because of the tooltip.)
        className={`${inter.variable} ${geistMono.variable} h-full overflow-x-clip antialiased`}
      >
        <body
          // The ground comes from `--background` (now Ginshu, dark-only) via the
          // `body` rule in globals.css. No `bg-*` utility here: a second source of
          // truth for the app ground is how half-ported surfaces end up on the
          // wrong one.
          className="min-h-full overflow-x-clip font-sans"
          // Reserve bottom space for the mobile debug-panel strip so it
          // behaves like a sticky footer (content scrolls above it
          // instead of being overlaid). The variable is published by
          // `<DebugPanel />` only on mobile (matchMedia gate); on
          // desktop the panel is a right rail and the variable stays
          // unset, so this resolves to 0 and the body padding
          // collapses.
          style={{ paddingBottom: 'var(--debug-panel-h, 0px)' }}
        >
          <NextIntlClientProvider>
            {children}
            <DebugPanelMount debugMode={debugMode} />
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  )
}
