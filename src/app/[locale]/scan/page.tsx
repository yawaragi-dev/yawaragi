import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ScanForm } from '@/components/scan/scan-form'
import { AgeGate } from '@/components/legal/age-gate'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { hasAcceptedAgeGate } from '@/lib/legal/age-gate-cookie'
import { isLaunched } from '@/i18n/launch-state'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'

/**
 * Scan entry route — `/[locale]/scan`.
 *
 * Issue #106 / PRD #105 §"Age-gate interaction": the entry CTA is a
 * discovery affordance and IS allowed pre-age-gate. The result (which
 * `<ScanForm />` produces on a `matched` state) navigates to
 * `/[locale]/sake/[brandId]`, which IS gated by the proxy — so flavor
 * and brand data still never leaks before the gate is accepted.
 *
 * RSC by default: this page is async server, the only `'use client'`
 * descendant is `<ScanForm />` (which legitimately needs state +
 * onChange + useActionState — see its file-level comment).
 */

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'scan.entry' })
  return {
    title: `${t('title')} | Yawaragi`,
    description: t('intro'),
  }
}

export default async function ScanEntryPage({ params }: PageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  // ADR-0008: non-launched locales (`de` today) serve coming-soon for
  // every gated path via the proxy. The scan route is ungated so the
  // proxy doesn't intercept; we render the coming-soon copy directly
  // here for the German visitor so the launch state still gates content.
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

  const t = await getTranslations({ locale, namespace: 'scan.entry' })
  const cookieJar = await cookies()
  const gateAccepted = hasAcceptedAgeGate(cookieJar)
  // Server-rendered: the debug cookie is HttpOnly, so the form can't
  // read it from client JS. We pass the boolean down as a prop and the
  // form skips the panel + per-step accumulation when it's false.
  const debugMode = isDebugEnabledFromCookies(cookieJar)

  return (
    <>
      <main
        className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
        data-testid="scan-entry-page"
      >
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          {t('title')}
        </h1>
        <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
          {t('intro')}
        </p>
        <ScanForm locale={locale} debugMode={debugMode} />
      </main>
      {/* The age gate keeps the RESULT off-screen: when ScanForm matches,
          it router.push()es to /sake/[brandId] — that path IS gated, so
          an un-accepted visitor lands on the gate landing instead of the
          brand page. We additionally render the gate on the entry route
          itself so the moment the visitor taps the scan button without
          having accepted, the gate is already present and immediately
          interruptible. */}
      {!gateAccepted && <AgeGate />}
    </>
  )
}
