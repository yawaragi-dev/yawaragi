import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { isPlaceholderBrewery } from '@/lib/schemas/brewery'
import {
  lookupBrand,
  lookupBreweryByBrand,
  lookupFlavorChart,
} from '@/lib/sakenowa/lookup'
import { FlavorChartView } from '@/components/sake/flavor-chart'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'

/**
 * Phase 2's smoke-test surface. Renders a single sake brand from the
 * Postgres mirror. The proxy rewrites `/de/sake/*` to coming-soon per
 * ADR-0008 (EN-first launch), so this page in practice only renders on
 * `/en/`. Slice 6 (#49) adds the 6-axis FlavorChart. Future slices add
 * SakenowaAttribution (slice 7, #50 — above-fold banner) and slice 8's
 * ProvenanceBadge (#51).
 */
interface PageProps {
  params: Promise<{ locale: string; brandId: string }>
}

// `cache()` dedupes lookups across the same request — `generateMetadata`
// and the page component both fetch the brand; without this we'd hit
// Postgres twice.
const lookupBrandCached = cache(lookupBrand)
const lookupBreweryCached = cache(lookupBreweryByBrand)
const lookupFlavorChartCached = cache(lookupFlavorChart)

// Reject "1abc" (which `Number.parseInt('1abc', 10)` would silently coerce
// to 1) and similar garbage. Strict numeric matching only.
function parseBrandIdParam(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { brandId: brandIdParam } = await params
  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) return {}
  const brand = await lookupBrandCached(brandId)
  if (!brand) return {}
  const title =
    brand.nameKanji === brand.name
      ? `${brand.nameKanji} | Yawaragi`
      : `${brand.nameKanji} (${brand.name}) | Yawaragi`
  return { title }
}

export default async function SakeBrandPage({ params }: PageProps) {
  const { locale, brandId: brandIdParam } = await params
  setRequestLocale(locale)

  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) {
    notFound()
  }

  const [brand, brewery, flavorChart] = await Promise.all([
    lookupBrandCached(brandId),
    lookupBreweryCached(brandId),
    lookupFlavorChartCached(brandId),
  ])
  if (!brand) {
    notFound()
  }

  const t = await getTranslations('sake.brand')
  // While the Sakenowa-sourced rows have `name === nameKanji` (both are the
  // Japanese name), don't render the romaji line redundantly. Phase 5+ (or
  // a future romaji-transliteration step) populates `name` with the Latin
  // form and the divergence justifies two lines.
  const showBrandRomaji = brand.name !== brand.nameKanji
  // Hide the brewery section entirely for Sakenowa placeholder rows
  // (~48 in the dataset). Showing "Brewery:" with no name reads worse
  // than not showing the section at all; slice 9 (#52) adds the area /
  // prefecture context that would make a "Unknown brewery in X" label
  // meaningful.
  const showBrewery = brewery !== null && !isPlaceholderBrewery(brewery)
  const showBreweryRomaji = showBrewery && brewery.name !== brewery.nameKanji

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="sake-brand-page"
    >
      <SakenowaAttribution placement="above-fold" />
      <h1
        className="text-4xl font-semibold leading-tight tracking-tight"
        lang="ja"
        data-testid="brand-name-kanji"
      >
        {brand.nameKanji}
      </h1>
      {showBrandRomaji && (
        <p
          className="text-xl text-zinc-700 dark:text-zinc-300"
          data-testid="brand-name-romaji"
        >
          {brand.name}
        </p>
      )}
      {showBrewery && (
        <section
          className="flex flex-col gap-1"
          data-testid="brand-brewery"
          aria-label={t('breweryLabel')}
        >
          <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('breweryLabel')}
          </p>
          <p
            className="text-2xl font-medium"
            lang="ja"
            data-testid="brewery-name-kanji"
          >
            {brewery.nameKanji}
          </p>
          {showBreweryRomaji && (
            <p
              className="text-base text-zinc-700 dark:text-zinc-300"
              data-testid="brewery-name-romaji"
            >
              {brewery.name}
            </p>
          )}
        </section>
      )}
      {flavorChart && <FlavorChartView chart={flavorChart} />}
      <Link
        href="/"
        className="text-base font-medium underline underline-offset-4"
      >
        {t('backToHome')}
      </Link>
    </main>
  )
}
