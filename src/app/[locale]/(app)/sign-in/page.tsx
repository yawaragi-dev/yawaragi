import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { SignInCard } from '@/components/auth/sign-in-card'

/**
 * `/[locale]/sign-in` — the maintainer login surface.
 *
 * Why this exists: Clerk was wired for IDENTITY from Phase 2 (`clerkMiddleware`
 * in `src/proxy.ts`, `<ClerkProvider>` in the locale layout) but the app
 * rendered no Clerk UI, so `auth().userId` could never be populated by a real
 * browser session. Phase 5.5 then gated the tasting journal on exactly that
 * value — which made the journal unreachable outside the non-prod
 * `yawaragi_journal_stub` seam. This page closes that gap.
 *
 * LOGIN ONLY. Per ADR-0020 v1 is a maintainer-only private beta: there is no
 * `/sign-up` route, and `<SignInCard />` suppresses the widget's sign-up
 * affordance. Signing in is not the same as being admitted — the allowlist in
 * `maintainer.ts` still decides, and fails closed for anyone not listed.
 *
 * Ungated (allowlisted in `isGatedPath`) for the same reason `/imprint` and
 * `/privacy` are: it renders no sake, flavor, or recommendation data, so
 * JMStV §6(5) has nothing to gate here. Gating it would also trap the
 * maintainer behind an age-gate rewrite on their own entry point.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'signIn' })
  return {
    title: `${t('title')} — Yawaragi`,
    // A private-beta login surface has nothing to offer a crawler.
    robots: { index: false, follow: false },
  }
}

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations('signIn')

  return (
    <main
      className="flex flex-1 w-full max-w-md mx-auto flex-col items-center gap-8 py-16 px-8"
      data-testid="sign-in-page"
    >
      <header className="flex flex-col gap-2 text-center">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight">
          {t('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300">{t('intro')}</p>
      </header>
      {/* Widget copy is localised at <ClerkProvider> in the locale layout —
          Clerk applies `localization` at the provider, not per widget. */}
      <SignInCard />
    </main>
  )
}
