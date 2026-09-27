import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { LandingHero } from '@/components/landing/landing-hero'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { getLandingSampleScan } from '@/lib/landing/sample-scan'

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

  // UX-E (#166): lead with a real example scan result — but ONLY after the
  // 18+ gate is accepted, because the hero renders Sakenowa flavor data
  // (JMStV: no flavor data before acceptance). We fetch the sample lazily
  // for the same reason — no flavor data touches the DOM pre-acceptance —
  // and fall back to the text intro when the mirror has no sample row.
  const sample = gateAccepted ? await getLandingSampleScan() : null

  return (
    <>
      <main className="flex flex-1 w-full max-w-4xl mx-auto flex-col gap-12 py-16 px-8">
        {sample ? (
          <LandingHero sample={sample} locale={locale} />
        ) : (
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
        )}

        <section className="grid gap-8 sm:grid-cols-3">
          {/*
            All three cards resolve to a live route. Chat → `/suggest`
            (Phase 4 shipped); Profile → `/profile` (Phase 5 coming-soon
            mock, UX-D #165). Shared `<LandingCard />` shape so the
            hover / focus / arrow affordances stay in lockstep — a dead
            card here would collide with UX-A's header-nav promise that
            every advertised surface has a real destination (#162 AC).
          */}
          <LandingCard
            href="/scan"
            title={t('sectionScanTitle')}
            body={t('sectionScanBody')}
            testId="landing-scan-cta"
          />
          <LandingCard
            href="/suggest"
            title={t('sectionChatTitle')}
            body={t('sectionChatBody')}
            testId="landing-chat-cta"
          />
          <LandingCard
            href="/profile"
            title={t('sectionProfileTitle')}
            body={t('sectionProfileBody')}
            testId="landing-profile-cta"
          />
        </section>
      </main>
      {!gateAccepted && <AgeGate />}
    </>
  )
}

interface LandingCardProps {
  href: '/scan' | '/suggest' | '/profile'
  title: string
  body: string
  testId: string
}

function LandingCard({ href, title, body, testId }: LandingCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 -m-3 p-3 rounded-lg transition-colors hover:bg-zinc-100/70 dark:hover:bg-zinc-800/60 active:bg-zinc-200/70 dark:active:bg-zinc-700/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:focus-visible:outline-zinc-100"
      data-testid={testId}
    >
      <h2 className="text-lg font-medium inline-flex items-center gap-1.5">
        {title}
        <span
          aria-hidden
          className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
        >
          →
        </span>
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{body}</p>
    </Link>
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
