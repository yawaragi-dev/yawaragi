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
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { FlavorChartView } from '@/components/sake/flavor-chart'
import { ProvenanceBadge } from '@/components/sake/provenance-badge'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'

/**
 * Phase 2's smoke-test surface. Renders a single sake brand from the
 * Postgres mirror. The proxy rewrites `/de/sake/*` to coming-soon per
 * ADR-0008 (EN-first launch), so this page in practice only renders on
 * `/en/`. Slice 6 (#49) adds the 6-axis FlavorChart, slice 7 (#50) the
 * above-fold SakenowaAttribution, slice 8 (#51) the ProvenanceBadge
 * (renders nothing for Phase 2's sakenowa-sourced data; wired up so
 * Phase 3+ LLM-derived attachments slot in without page churn).
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
  // Render the romaji line when the ingest pipeline populated it
  // (issue #121). NULL means "transliteration hasn't run yet on this
  // row" — the operator runs `pnpm ingest` to fill the column.
  const showBrandRomaji = brand.nameRomaji !== null
  // Hide the brewery section entirely for Sakenowa placeholder rows
  // (~48 in the dataset). Showing "Brewery:" with no name reads worse
  // than not showing the section at all.
  const showBrewery = brewery !== null && !isPlaceholderBrewery(brewery)
  const showBreweryRomaji = showBrewery && brewery.nameRomaji !== null
  // Prefecture is editorially mapped (manual_curation per ADR-0005)
  // because Sakenowa's /areas endpoint publishes Japanese names only.
  // For the in-Japan brewery rows the lookup always returns a value;
  // for placeholder + foreign-producer rows it can be null or the
  // "International" sentinel — we still show the sentinel because
  // "International" is more useful than a hidden field.
  const prefecture = showBrewery ? getPrefectureNames(brewery.areaId) : null

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="sake-brand-page"
    >
      <SakenowaAttribution placement="above-fold" />
      <div className="flex flex-wrap items-baseline gap-3">
        <h1
          className="text-4xl font-semibold leading-tight tracking-tight"
          lang="ja"
          data-testid="brand-name-kanji"
        >
          {brand.nameKanji}
        </h1>
        {/* Phase 2: brand.source is always 'sakenowa', so the badge
            renders nothing. The import is intentional — Phase 3+ data
            attached to the brand (LLM tasting notes, cross-beverage
            mappings) will flow through this same attachment point. */}
        <ProvenanceBadge source={brand.source} confidence={brand.confidence} />
      </div>
      {showBrandRomaji && (
        // ProvenanceBadge with source='llm_inferred' is load-bearing
        // here per CLAUDE.md anti-pattern "Do NOT show LLM-extracted
        // data without a ProvenanceBadge". The brand RECORD itself is
        // Sakenowa-sourced (the badge attached to the kanji above
        // renders nothing for that source); the romaji FIELD is LLM-
        // derived (Hepburn romanisation of the kanji by Anthropic
        // Haiku — see src/lib/sakenowa/romaji.ts). ADR-0005's
        // taxonomy is per-record, not per-field, so we render the
        // badge on the displayed field rather than re-architect the
        // schema for per-field provenance.
        <p
          className="flex items-baseline gap-2 text-xl text-zinc-700 dark:text-zinc-300"
          data-testid="brand-name-romaji"
        >
          <span lang="en">{brand.nameRomaji}</span>
          <ProvenanceBadge source="llm_inferred" />
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
            // Same LLM-derived-romaji-on-a-Sakenowa-record story as
            // the brand romaji above.
            <p
              className="flex items-baseline gap-2 text-base text-zinc-700 dark:text-zinc-300"
              data-testid="brewery-name-romaji"
            >
              <span lang="en">{brewery.nameRomaji}</span>
              <ProvenanceBadge source="llm_inferred" />
            </p>
          )}
        </section>
      )}
      {prefecture && (
        // Prefecture name in both languages. The English form is
        // editorially-mapped (Hepburn romanisation, suffix stripped
        // per English geography convention) — see
        // `src/lib/sakenowa/prefecture.ts`. The Sakenowa-sourced
        // kanji form is the source of truth for matching; the EN
        // form is the supplementary display per the operator ask.
        <section
          className="flex flex-col gap-1"
          data-testid="brand-prefecture"
          aria-label={t('prefectureLabel')}
        >
          <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t('prefectureLabel')}
          </p>
          <p className="text-base">
            <span lang="en" data-testid="prefecture-name-en">
              {prefecture.nameEn}
            </span>
            <span className="mx-2 text-zinc-400 dark:text-zinc-600">·</span>
            <span lang="ja" data-testid="prefecture-name-ja">
              {prefecture.nameJa}
            </span>
          </p>
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
