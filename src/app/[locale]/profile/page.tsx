import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { TasteProfileMock } from '@/components/profile/taste-profile-mock'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'

/**
 * `/[locale]/profile` — Taste profile coming-soon route (UX-D / #165).
 *
 * The real feature is Phase 5 (deferred with auth). This route exists so
 * the header nav has a real destination today, and so the design target
 * for Phase 5 lives somewhere maintainable — the sample radar mock IS the
 * design target the future personal profile builds toward. All copy is
 * discovery-framed and honestly labelled "coming soon"; the sample
 * profile carries an illustrative caption so nothing on the page can be
 * mistaken for real personal data (there is no personal data to collect
 * yet — see ADR-0009 minimisation principle).
 *
 * Age gate: the mock renders flavor-vocabulary content that qualifies as
 * gated content under CLAUDE.md's "Do NOT display flavor or recommendation
 * data before the 18+ gate has been accepted" rule. Same pattern as the
 * suggest page — check `hasAcceptedAgeGate` on the RSC and render
 * `<AgeGate />` instead when unaccepted. Locale launch gate is handled
 * upstream by the proxy (`src/proxy.ts`), which rewrites all gated paths
 * on non-launched locales to the coming-soon landing.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'profile' })
  return { title: `${t('title')} · Yawaragi` }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  // Belt on top of the proxy's suspenders: the proxy rewrites gated
  // paths on non-launched locales to the coming-soon landing before we
  // get here, but if a future proxy-matcher change lets DE reach this
  // route, render the same coming-soon block `/scan` and `/suggest`
  // render (ADR-0008). Blank page would be a worse fallback.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <main
        className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
        data-testid="coming-soon"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {tComingSoon('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {tComingSoon('body')}
        </p>
        <Link
          href="/"
          locale="en"
          className="text-base font-medium underline underline-offset-4"
        >
          {tComingSoon('switchToEn')}
        </Link>
      </main>
    )
  }

  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)

  if (!gateAccepted) {
    return <AgeGate />
  }

  const t = await getTranslations('profile')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-10 py-12 px-6"
      data-testid="profile-page"
    >
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            {t('title')}
          </h1>
          <span
            className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            data-testid="profile-coming-soon-badge"
          >
            {t('comingSoonBadge')}
          </span>
        </div>
        <p className="max-w-prose text-base text-zinc-700 dark:text-zinc-300">
          {t('intro')}
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">{t('sampleHeading')}</h2>
        <TasteProfileMock />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('suggestBridgeHeading')}</h2>
        <p className="max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
          {t('suggestBridgeBody')}
        </p>
        <Link
          href="/suggest"
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-800"
          data-testid="profile-suggest-cta"
        >
          {t('suggestBridgeCta')}
          <span aria-hidden>→</span>
        </Link>
      </section>
    </main>
  )
}
