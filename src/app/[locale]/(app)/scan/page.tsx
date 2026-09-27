import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ScanForm } from '@/components/scan/scan-form'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
// `DebugPanelMount` lives at the layout level (renders persistently
// across navigations). This page only sources the boolean prop the
// form uses to gate its per-step pushes into the app-level store.
import { isLaunched } from '@/i18n/launch-state'
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'

/**
 * Scan entry route — `/[locale]/scan`.
 *
 * ADR-0015 (supersedes PRD #105 §"Age-gate interaction"): the route is
 * fully age-gated. The result renders IN PLACE on `/scan` (not
 * `/sake/[brandId]` any more), so a modal overlay would be too weak a
 * seam — the JMStV "no flavor data pre-acceptance" invariant is
 * enforced by the proxy allowing only accepted visitors through to this
 * page. No `<AgeGate />` overlay is rendered here; if the visitor
 * reaches this component, the cookie is set.
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
  // Server-rendered: the debug cookie is HttpOnly, so the form can't
  // read it from client JS. We pass the boolean down as a prop and the
  // form skips the panel + per-step accumulation when it's false.
  const debugMode = isDebugEnabledFromCookies(cookieJar)

  return (
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
  )
}
