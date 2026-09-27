import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { Link } from '@/i18n/navigation'
import { TabPlaceholder } from '@/components/layout/tab-placeholder'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'

/**
 * The Home tab — design v1.4 §3, not yet ported.
 *
 * The route exists so the tab bar has a real destination (#162: advertised
 * surfaces are navigable, never dead). See `<TabPlaceholder />` for why this
 * is scaffolding rather than a design state, and #300 for the port.
 *
 * Age gating is the proxy's job: `/home` is absent from
 * `UNGATED_LOCALE_PATHS`, and that list is deny-by-default, so a visitor who
 * has not accepted the 18+ gate never reaches this component.
 */

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'tabPlaceholder.home' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function HomeTabPage({ params }: PageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  // ADR-0008: the German surface is not launched, so a deep link renders the
  // same coming-soon block every other gated route does.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-16" data-testid="coming-soon">
        <h1 className="text-headline font-medium text-ink">{tComingSoon('title')}</h1>
        <p className="max-w-prose text-body text-ash-600">{tComingSoon('body')}</p>
        <Link href="/" locale="en" className="text-body font-medium underline underline-offset-4">
          {tComingSoon('switchToEn')}
        </Link>
      </div>
    )
  }

  const t = await getTranslations({ locale, namespace: 'tabPlaceholder.home' })

  return (
    <TabPlaceholder
      title={t('title')}
      body={t('body')}
      link={{ href: '/scan', label: t('linkLabel') }}
    />
  )
}
