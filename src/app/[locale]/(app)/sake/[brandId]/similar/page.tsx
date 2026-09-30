import { cache } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BackLink } from '@/components/layout/back-link'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import {
  SimilarSakeRow,
  type SimilarSakeRowStrings,
} from '@/components/sake/similar-sake-row'
import { getPathname, Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'
import { describeSimilarity } from '@/lib/flavor/similarity-reason'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { findSimilarBrands } from '@/lib/sakenowa/similar-brands'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'

/**
 * §6 Similar sakes — "Plain ranked list, **no chat, no model call**."
 *
 * The cheapest real surface in the design: L2 distance over the six axes we
 * already mirror, ranked in Postgres and re-ranked in
 * `findSimilarByFlavor`. No LLM, no MCP, no paid API — so it costs a query and
 * carries `sakenowa_inferred` (ADR-0005).
 *
 * Its own screen rather than a section, per §6, with §6's header: "back ·
 * 'Similar to {name}'". That back arrow is rule 11's per-screen one — this is
 * the first screen to supply its own title, which is exactly the condition the
 * shared `<Header />` says the arrow waits for.
 *
 * Two empty states, both specified. **No chart for this subject** is §6's own
 * ("a short line and the bottle-page link") and is the common case: ADR-0016
 * records that around half the catalogue has no `flavor_charts` row. **No
 * matches** cannot happen with a populated mirror but is handled rather than
 * rendering a heading over nothing.
 *
 * Sakenowa attribution is mandatory here: every row is flavour data. It is
 * inline (not above-fold) because the ranked list, not one record, is the
 * page's subject.
 */
interface PageProps {
  params: Promise<{ locale: string; brandId: string }>
}

// Same guard the bottle page uses: the segment is a string, and a non-numeric
// one is a 404 rather than a NaN query.
function parseBrandIdParam(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

const lookupBrandCached = cache(lookupBrand)

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, brandId: brandIdParam } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) return {}

  const brand = await lookupBrandCached(brandId)
  if (!brand) return {}

  const t = await getTranslations({ locale, namespace: 'sake.similar' })
  return { title: `${t('title', { name: brand.nameKanji })} | Yawaragi` }
}

export default async function SimilarSakesPage({ params }: PageProps) {
  const { locale, brandId: brandIdParam } = await params
  setRequestLocale(locale)

  const brandId = parseBrandIdParam(brandIdParam)
  if (brandId === null) notFound()

  const brand = await lookupBrandCached(brandId)
  if (!brand) notFound()

  const t = await getTranslations('sake.similar')
  const tHeader = await getTranslations('header')

  // The bottle page is where back goes when there is no history to pop — a
  // visitor who deep-links here wants the sake this list is about.
  const bottleHref = getPathname({
    locale,
    href: { pathname: '/sake/[brandId]', params: { brandId: String(brandId) } },
  })

  const similar = await findSimilarBrands(brandId)

  const strings: SimilarSakeRowStrings = {
    percentSimilar: (percent) => t('percentSimilar', { percent }),
    axisPair: (first, second) => t('axisPair', { first, second }),
    reason: {
      sharedAndMore: (shared, axis) => t('reasonSharedAndMore', { shared, axis }),
      sharedAndLess: (shared, axis) => t('reasonSharedAndLess', { shared, axis }),
      sharedOnly: (shared) => t('reasonSharedOnly', { shared }),
      moreOnly: (axis) => t('reasonMoreOnly', { axis }),
      lessOnly: (axis) => t('reasonLessOnly', { axis }),
    },
    // Prose forms, not the chart's display labels: "just as rich" wants a
    // lowercase adjective, and German needs its own word rather than a
    // lowercased "Kräftig".
    axisWord: (axis: FlavorAxis) => t(`axes.${axis}`),
  }

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-5 py-6"
      data-testid="similar-sakes-page"
    >
      {/* §6's header: back · "Similar to {name}". `-ml-3` pulls the 44px
          target back so the glyph lines up with the page gutter. */}
      <div className="flex items-center gap-1">
        <span className="-ml-3 flex">
          <BackLink fallbackHref={bottleHref} label={tHeader('backLabel')} />
        </span>
        <h1 className="min-w-0 truncate text-title font-medium text-ink">
          {t('title', { name: brand.nameKanji })}
        </h1>
      </div>

      {similar === null ? (
        <section className="flex flex-col gap-2" data-testid="similar-sakes-empty">
          <h2 className="text-card-heading font-medium text-ink">{t('emptyTitle')}</h2>
          <p className="text-body text-ash-600">{t('emptyBody')}</p>
          <Link
            href={{ pathname: '/sake/[brandId]', params: { brandId: String(brandId) } }}
            className="w-fit rounded-sm text-body font-medium text-ginshu-700 underline underline-offset-4 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="similar-sakes-empty-link"
          >
            {t('emptyLink')}
          </Link>
        </section>
      ) : similar.matches.length === 0 ? (
        <section className="flex flex-col gap-2" data-testid="similar-sakes-none">
          <h2 className="text-card-heading font-medium text-ink">{t('noMatchesTitle')}</h2>
          <p className="text-body text-ash-600">{t('noMatchesBody')}</p>
        </section>
      ) : (
        <>
          <p className="text-body text-ash-600">{t('intro')}</p>
          {/* No gap: each row carries the prototype's bottom divider. */}
          <ol className="flex flex-col" data-testid="similar-sakes-list">
            {similar.matches.map(({ brand: match }) => {
              const { percent, ...difference } = describeSimilarity(similar.target, match)
              return (
                <SimilarSakeRow
                  key={match.brandId}
                  brandId={match.brandId}
                  nameKanji={match.nameKanji}
                  nameRomaji={match.nameRomaji}
                  breweryKanji={match.breweryKanji}
                  breweryRomaji={match.breweryRomaji}
                  percent={percent}
                  difference={difference}
                  strings={strings}
                />
              )
            })}
          </ol>
          {/* Every row is Sakenowa flavour data, so attribution is not
              optional (ADR-0014 / the licence). Inline, because the list is
              the subject rather than any single record. */}
          <SakenowaAttribution placement="inline" />
        </>
      )}
    </main>
  )
}
