import { notFound } from 'next/navigation'
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

export default async function SakeBrandPage({ params }: PageProps) {
  const { locale, brandId: brandIdParam } = await params
  setRequestLocale(locale)

  const brandId = Number.parseInt(brandIdParam, 10)
  if (!Number.isInteger(brandId) || brandId <= 0) {
    notFound()
  }

  const brand = await lookupBrand(brandId)
  if (!brand) {
    notFound()
  }

  const t = await getTranslations('sake.brand')

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
      <p
        className="text-xl text-zinc-700 dark:text-zinc-300"
        data-testid="brand-name-romaji"
      >
        {brand.name}
      </p>
      <Link
        href="/"
        className="text-base font-medium underline underline-offset-4"
      >
        {t('backToHome')}
      </Link>
    </main>
  )
}
