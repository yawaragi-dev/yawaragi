import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound, redirect } from 'next/navigation'
import { BottlesHadList } from '@/components/collection/bottles-had'
import { ScreenBar } from '@/components/layout/screen-header'
import { Link, getPathname } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
import { routing } from '@/i18n/routing'
import { bottlesHad } from '@/lib/collection/bottles-had'
import { resolveViewerHistory } from '@/lib/collection/resolve-viewer-history'

/**
 * "Bottles you've had" (design v1.10, AB6; 132): the bottles no longer in the
 * cellar, newest first, read off the bottle history. Reached from the last
 * row under the Cellar. No total, no grouping by month (X5): a list to
 * remember by, not a tally. Each row opens the page of what the bottle was;
 * its ⋯ takes it off the list for good.
 *
 * Age-gated by the proxy like every app route: it names sakes. Anyone with no
 * collection (not the maintainer, not looking at the sample) goes to
 * Collection, which says what will be there.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'bottlesHad' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function BottlesHadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const cellar = getPathname({ locale, href: { pathname: '/collection', query: { tab: 'cellar' } } })
  if (!isLaunched(locale)) redirect(cellar)

  const view = await resolveViewerHistory(await cookies())
  if (!view) redirect(cellar)

  const t = await getTranslations('bottlesHad')
  const bottles = bottlesHad(view.history)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-4" data-testid="bottles-had-page">
      <ScreenBar title={t('title')} titleAs="h1" backFallbackHref={cellar} />
      {view.unavailable ? (
        <p className="max-w-prose text-body text-ash-600" data-testid="bottles-had-unavailable">
          {t('unavailable')}
        </p>
      ) : bottles.length === 0 ? (
        <section className="flex flex-col gap-3" data-testid="bottles-had-empty">
          <p className="max-w-prose text-body text-ash-600">{t('empty')}</p>
          <Link
            href={{ pathname: '/collection', query: { tab: 'cellar' } }}
            className="w-fit text-body font-medium text-ginshu-700 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          >
            {t('toCellar')}
          </Link>
        </section>
      ) : (
        <>
          <p className="max-w-prose text-subtle leading-normal text-ash-700">{t('intro')}</p>
          <BottlesHadList bottles={bottles} bottlingIds={view.bottlingIds} readOnly={view.readOnly} now={view.now} />
        </>
      )}
      {/* The Sakenowa credit is line 1 of the end-of-screen block the app
          shell renders under this list (rule 15): the names are the catalogue's. */}
    </main>
  )
}
