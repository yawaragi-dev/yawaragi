import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { env } from '@/env'
import { Link, getPathname } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { ScreenBar, TabHeader } from '@/components/layout/screen-header'
import { PrototypeSwitcher } from '@/components/prototype/prototype-switcher'
import { fixtureCellar } from './fixture-cellar'
import { isDishId } from './pick-for-dish'
import { VariantA } from './variant-a'
import { VariantB } from './variant-b'
import { VariantC } from './variant-c'

/**
 * PROTOTYPE — "Pick a bottle from my cellar for a dish". THROWAWAY; see
 * NOTES.md. Three structurally different layouts on this one route,
 * switched with `?variant=A|B|C`; `?cellar=empty` swaps in an empty cellar;
 * `?dish=<id>` preselects a dish.
 *
 * - Fed by a fixture cellar (`fixture-cellar.ts`): no Upstash, no database,
 *   no writes, and the dish choice is stored nowhere.
 * - Behind the 18+ gate like every app route (the proxy's ungated list is
 *   deny-by-default, and this path is not on it).
 * - Linked from nowhere. 404s on production (`VERCEL_ENV=production`), so a
 *   stray merge cannot ship it; local dev and Vercel previews show it.
 * - Rendered in every locale, German included, so the strings can be read
 *   before `de` launches.
 */

const VARIANTS = ['A', 'B', 'C'] as const
type Variant = (typeof VARIANTS)[number]

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'prototypeDishPairing' })
  return { title: `${t('title')} (${t('prototype.badge')}) | Yawaragi`, robots: { index: false } }
}

export default async function DishPairingPrototypePage({ params, searchParams }: PageProps) {
  if (env.VERCEL_ENV === 'production') notFound()
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  const query = await searchParams
  const variant: Variant = VARIANTS.includes(query.variant as Variant) ? (query.variant as Variant) : 'A'
  const cellar = query.cellar === 'empty' ? 'empty' : 'full'
  const dish = isDishId(query.dish) ? query.dish : null
  const bottles = fixtureCellar(cellar)

  const t = await getTranslations('prototypeDishPairing')
  const tCollection = await getTranslations('collection')
  // Remount on a variant or fixture change, so each starts from the URL.
  const key = `${variant}-${cellar}`

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6 pb-36" data-testid="dish-pairing-prototype">
      {variant === 'C' ? (
        <>
          {/* C lives inside the Cellar segment, so it is drawn with the
              Collection tab's own top and a (static) segment control. */}
          <TabHeader>
            <h1 className="text-tab-title font-medium text-ink">{tCollection('title')}</h1>
          </TabHeader>
          <nav aria-label={tCollection('sectionsLabel')} className="flex self-start rounded-lg border border-divider">
            <Link href={{ pathname: '/collection', query: { tab: 'journal' } }} className="flex min-h-9 items-center px-3.5 text-subtle text-ink">
              {tCollection('segmentJournal')}
            </Link>
            <span
              aria-current="page"
              className="-m-px flex min-h-9 items-center rounded-lg border border-ginshu-500 bg-ginshu-100 px-3.5 text-subtle font-medium text-ginshu-700"
            >
              {tCollection('segmentCellar')}
            </span>
          </nav>
          <VariantC key={key} bottles={bottles} initialDish={dish} />
        </>
      ) : (
        <>
          <ScreenBar
            title={t('title')}
            titleAs="h1"
            backFallbackHref={getPathname({ locale, href: { pathname: '/collection', query: { tab: 'cellar' } } })}
          />
          {variant === 'A' ? (
            <VariantA key={key} bottles={bottles} initialDish={dish} />
          ) : (
            <VariantB key={key} bottles={bottles} initialDish={dish} />
          )}
        </>
      )}
      <PrototypeSwitcher
        variants={VARIANTS.map((k) => ({ key: k, label: t(`prototype.variants.${k}`) }))}
        current={variant}
        previousLabel={t('prototype.previous')}
        nextLabel={t('prototype.next')}
        badge={t('prototype.badge')}
        fixture={{
          param: 'cellar',
          current: cellar,
          options: [
            { value: 'full', label: t('prototype.cellarFull') },
            { value: 'empty', label: t('prototype.cellarEmpty') },
          ],
        }}
      />
    </main>
  )
}
