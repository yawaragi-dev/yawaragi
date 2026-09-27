import { Camera, Hexagon, Star } from '@phosphor-icons/react/dist/ssr'
import type { Icon } from '@phosphor-icons/react'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { AgeGate } from '@/components/legal/age-gate'
import { LandingFooter } from '@/components/landing/landing-footer'
import { LandingHeader } from '@/components/landing/landing-header'
import { LandingHero } from '@/components/landing/landing-hero'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { getLandingSampleScan } from '@/lib/landing/sample-scan'

/**
 * The landing page — design v1.4 §0.
 *
 * A normally scrolling page outside the app shell: §0's own header, a hero,
 * three feature cards, the privacy promise, and the five-item footer with the
 * Sakenowa credit.
 *
 * **Where the real example sits.** §0 puts a phone placeholder in the hero's
 * right column and tells us to "replace with a real app screenshot", so that
 * is where `<LandingHero />` goes — an actual scan result from the Sakenowa
 * mirror (UX-E #166), framed as the device. Two columns above ~700px, stacked
 * below, per §0.
 *
 * It renders **only after the 18+ gate is accepted**, and is fetched lazily
 * for the same reason: it is Sakenowa flavor data, and JMStV allows none of
 * that before acceptance. That predates this port and is unchanged by it.
 */
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
  const sample = gateAccepted ? await getLandingSampleScan() : null

  return (
    <>
      <LandingHeader />
      <main className="mx-auto w-full max-w-[1120px] px-5 pb-16 sm:px-[clamp(20px,5vw,56px)]">
        <section
          className="grid items-center gap-10 py-14 min-[700px]:grid-cols-2"
          data-testid="landing-intro"
        >
          <div className="flex flex-col gap-5">
            <p className="flex items-center gap-2.5 text-section-label uppercase text-ash-600">
              {/* The design's accent "mark": a 2px × 14px rule before a heading. */}
              <span className="h-3.5 w-0.5 bg-ginshu-500" aria-hidden="true" />
              {t('kicker')}
            </p>
            <h1 className="max-w-[16ch] text-[clamp(36px,7vw,58px)] font-medium leading-[1.05] tracking-[-0.03em] text-balance text-ink">
              {t('heading')}
            </h1>
            <p className="max-w-[54ch] text-md-alt text-ash-600">{t('lead')}</p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/scan"
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-ash-200 px-5 text-card-heading font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="landing-scan-cta"
              >
                <Camera size={17} aria-hidden="true" />
                {t('ctaScan')}
              </Link>
              {/* An in-page anchor, so it is a real destination rather than a
                  promise: it scrolls to the three feature cards below. */}
              <a
                href="#how"
                className="inline-flex h-12 items-center rounded-lg px-4 text-card-heading text-ash-600 transition-colors hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="landing-how-cta"
              >
                {t('ctaHow')}
              </a>
          </div>
          <p className="text-meta text-ash-500">{t('smallPrint')}</p>
          </div>

          {/* §0's right column. Absent until the 18+ gate is accepted — it is
              Sakenowa flavour data, and JMStV allows none before acceptance —
              so the hero is single-column for a visitor who has not confirmed.
              That predates this port and is unchanged by it. */}
          {sample && <LandingHero sample={sample} locale={locale} />}
        </section>

        <section id="how" className="flex scroll-mt-6 flex-col gap-6 pb-14">
          <h2 className="text-headline font-medium text-ink">{t('featuresHeading')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={Camera}
              title={t('featureIdentifyTitle')}
              body={t('featureIdentifyBody')}
              testId="landing-feature-identify"
            />
            <FeatureCard
              icon={Star}
              title={t('featureRateTitle')}
              body={t('featureRateBody')}
              testId="landing-feature-rate"
            />
            <FeatureCard
              icon={Hexagon}
              title={t('featurePalateTitle')}
              body={t('featurePalateBody')}
              testId="landing-feature-palate"
            />
          </div>
        </section>

        <section
          className="flex flex-col items-start gap-3 rounded-xl border border-divider p-6"
          data-testid="landing-privacy-promise"
        >
          <h2 className="text-title font-medium text-ink">{t('privacyTitle')}</h2>
          <p className="max-w-[62ch] text-body text-ash-600">{t('privacyBody')}</p>
          <Link
            href="/home"
            className="mt-1 inline-flex h-11 items-center rounded-lg bg-ash-200 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="landing-privacy-cta"
          >
            {t('openApp')}
          </Link>
        </section>
      </main>
      <LandingFooter />
      {!gateAccepted && <AgeGate />}
    </>
  )
}

interface FeatureCardProps {
  icon: Icon
  title: string
  body: string
  testId: string
}

function FeatureCard({ icon: Icon, title, body, testId }: FeatureCardProps) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-surface p-5" data-testid={testId}>
      <Icon size={24} className="text-ginshu-600" aria-hidden="true" />
      <h3 className="text-md-alt font-medium text-ink">{title}</h3>
      <p className="text-body text-ash-600">{body}</p>
    </div>
  )
}

async function ComingSoonPage() {
  const t = await getTranslations('comingSoon')
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-16" data-testid="coming-soon">
      <h1 className="text-headline font-medium text-ink">{t('title')}</h1>
      <p className="max-w-prose text-body text-ash-600">{t('body')}</p>
      <Link href="/" locale="en" className="text-body font-medium underline underline-offset-4">
        {t('switchToEn')}
      </Link>
    </main>
  )
}
