import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { lookupBrand } from '@/lib/sakenowa/lookup'

/**
 * Phase 2's smoke-test surface. Renders a single sake brand from the
 * Postgres mirror. The proxy rewrites `/de/sake/*` to coming-soon per
 * ADR-0008 (EN-first launch), so this page in practice only renders on
 * `/en/`. Future slices add Brewery (#48), 6-axis FlavorChart (#49),
 * SakenowaAttribution (#50), and ProvenanceBadge (#51) to the same page.
 */
interface PageProps {
  params: Promise<{ locale: string; brandId: string }>
}

// `cache()` dedupes `lookupBrand` across the same request — `generateMetadata`
// and the page component both call it; without this we'd hit Postgres twice.
const lookupBrandCached = cache(lookupBrand)

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

  const brand = await lookupBrandCached(brandId)
  if (!brand) {
    notFound()
  }

  const t = await getTranslations('sake.brand')
  // While the Sakenowa-sourced rows have `name === nameKanji` (both are the
  // Japanese name), don't render the romaji line redundantly. Phase 5+ (or
  // a future romaji-transliteration step) populates `name` with the Latin
  // form and the divergence justifies two lines.
  const showRomaji = brand.name !== brand.nameKanji

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="sake-brand-page"
    >
      <h1
        className="text-4xl font-semibold leading-tight tracking-tight"
        lang="ja"
        data-testid="brand-name-kanji"
      >
        {brand.nameKanji}
      </h1>
      {showRomaji && (
        <p
          className="text-xl text-zinc-700 dark:text-zinc-300"
          data-testid="brand-name-romaji"
        >
          {brand.name}
        </p>
      )}
      <Link
        href="/"
        className="text-base font-medium underline underline-offset-4"
      >
        {t('backToHome')}
      </Link>
    </main>
  )
}
