import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!isLaunched(locale)) {
    return <ComingSoonPage />
  }

  const t = await getTranslations('landing')
  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)

  return (
    <>
      <main className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-12 py-16 px-8">
        <section className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            {t('title')}
          </h1>
          <p className="text-xl text-zinc-700 dark:text-zinc-300">
            {t('tagline')}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400 max-w-prose">
            {t('intro')}
          </p>
        </section>

        <section className="grid gap-8 sm:grid-cols-3">
          {/*
            Scan-section card is the live CTA — Phase 3 is shipped so
            this links straight to /scan. Subtle hover/active states
            so the affordance is discoverable without competing with
            the static Chat / Profile cards next to it. The arrow
            indicator nudges right on hover; the focus ring satisfies
            keyboard a11y. Wrapped in next-intl `<Link>` so the locale
            prefix is preserved.
          */}
          <Link
            href="/scan"
            className="group flex flex-col gap-2 -m-3 p-3 rounded-lg transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 active:bg-zinc-200/70 dark:active:bg-zinc-700/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
            data-testid="landing-scan-cta"
          >
            <h2 className="text-lg font-medium inline-flex items-center gap-1.5">
              {t('sectionScanTitle')}
              <span
                aria-hidden
                className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
              >
                →
              </span>
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionScanBody')}
            </p>
          </Link>
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t('sectionChatTitle')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionChatBody')}
            </p>
          </article>
          <article className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{t('sectionProfileTitle')}</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('sectionProfileBody')}
            </p>
          </article>
        </section>
      </main>
      {!gateAccepted && <AgeGate />}
    </>
  )
}

async function ComingSoonPage() {
  const t = await getTranslations('comingSoon')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="coming-soon"
    >
      <h1 className="text-4xl font-semibold leading-tight tracking-tight">
        {t('title')}
      </h1>
      <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
        {t('body')}
      </p>
      <Link
        href="/"
        locale="en"
        className="text-base font-medium underline underline-offset-4"
      >
        {t('switchToEn')}
      </Link>
    </main>
  )
}
