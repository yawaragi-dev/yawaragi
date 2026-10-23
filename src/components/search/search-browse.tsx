import { CaretDown, Hexagon, MapPin } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { FlavorTermsDisclosure } from '@/components/sake/flavor-terms-disclosure'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { withFilter, type BrowseFilter, type FlavorFilter } from '@/lib/sakenowa/browse-filter'
import { getPrefectureNames, JAPAN_PREFECTURES } from '@/lib/sakenowa/prefecture'
import { regionEntryFor } from '@/lib/guide/regions'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import { cn } from '@/lib/utils'

/**
 * §8's browse chips (design v1.8, M; 102, 103): **Prefecture** and **Flavor**,
 * each opening in place, plus "Clear" once one is set. Native `<details>`, so
 * like the rest of Search they work as links with no JavaScript: every button
 * is a link to `/search` with the filter changed.
 */
export async function SearchBrowse({ filter, counts, locale }: {
  filter: BrowseFilter
  counts: Record<number, number> | null
  locale: Locale
}) {
  const t = await getTranslations('search.browse')
  const prefecture = filter.areaId !== null ? getPrefectureNames(filter.areaId) : null
  const regionSlug = filter.areaId !== null ? regionEntryFor(filter.areaId) : null
  const flavorLabel = filter.flavor ? await flavorWords(filter.flavor, locale) : null

  return (
    <section className="flex flex-col gap-3" data-testid="search-browse">
      <div className="flex flex-wrap items-start gap-2">
        <details className="group" data-testid="search-browse-prefecture">
          <Chip icon={<MapPin size={15} aria-hidden="true" />} label={prefecture?.nameEn ?? t('prefecture')} on={prefecture !== null} />
          <ul className="mt-3 flex flex-wrap gap-2" role="list">
            {JAPAN_PREFECTURES.filter((p) => counts === null || (counts[p.id] ?? 0) > 0).map((p) => (
              <li key={p.id}>
                <Link
                  href={{ pathname: '/search', query: withFilter(filter, { areaId: p.id === filter.areaId ? null : p.id }) }}
                  aria-current={p.id === filter.areaId ? 'true' : undefined}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                    p.id === filter.areaId
                      ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800'
                      : 'border-ash-300 text-ink hover:bg-ash-100',
                  )}
                  data-testid={`search-browse-pref-${p.id}`}
                >
                  {p.nameEn}
                  {counts && <span className="text-ash-600">{counts[p.id]}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </details>

        <details className="group" data-testid="search-browse-flavor">
          <Chip icon={<Hexagon size={15} aria-hidden="true" />} label={flavorLabel ?? t('flavor')} on={flavorLabel !== null} />
          <FlavorRows filter={filter} />
        </details>

        {(prefecture !== null || filter.flavor !== null) && (
          <Link
            href="/search"
            className="flex min-h-10 items-center rounded-sm px-1 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="search-browse-clear"
          >
            {t('clear')}
          </Link>
        )}
      </div>
      {/* Design v1.9 Y3: one prefecture picked, and Learn has its region. */}
      {prefecture && regionSlug && (
        <Link
          href={{ pathname: '/learn/[slug]', params: { slug: regionSlug } }}
          className="w-fit text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="search-browse-region"
        >
          {t('aboutRegion', { prefecture: prefecture.nameEn })}
        </Link>
      )}
    </section>
  )
}

function Chip({ icon, label, on }: { icon: React.ReactNode; label: string; on: boolean }) {
  return (
    <summary
      className={cn(
        'flex w-fit min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 [&::-webkit-details-marker]:hidden',
        on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
      )}
    >
      {icon}
      {label}
      <CaretDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
    </summary>
  )
}

async function FlavorRows({ filter }: { filter: BrowseFilter }) {
  const t = await getTranslations('search.browse')
  const tAxis = await getTranslations('flavorAxis')
  return (
    <div className="mt-3 flex flex-col">
      <ul className="flex flex-col" role="list">
        {FLAVOR_AXES.map((axis) => (
          <li key={axis} className="flex min-h-12 items-center justify-between gap-3 border-b border-divider">
            <span className="text-body text-ink">
              {tAxis(`${axis}.label`)}{' '}
              <span lang="ja" className="text-subtle text-ash-600">
                {tAxis(`${axis}.kanji`)}
              </span>
            </span>
            <span className="flex overflow-hidden rounded-lg border border-ash-300" role="group" aria-label={tAxis(`${axis}.label`)}>
              {(['less', 'more'] as const).map((direction) => {
                const on = filter.flavor?.axis === axis && filter.flavor.direction === direction
                return (
                  <Link
                    key={direction}
                    href={{ pathname: '/search', query: withFilter(filter, { flavor: on ? null : { axis, direction } }) }}
                    aria-current={on ? 'true' : undefined}
                    className={cn(
                      'flex min-h-9 min-w-14 items-center justify-center px-3 text-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600',
                      direction === 'more' && 'border-l border-ash-300',
                      on ? 'bg-ginshu-100 text-ginshu-800' : 'text-ink hover:bg-ash-100',
                    )}
                    data-testid={`search-browse-${direction}-${axis}`}
                  >
                    {t(direction)}
                  </Link>
                )
              })}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-meta text-ash-700" id="search-browse-flavor-caveat">
        {t('caveat')}
      </p>
      <FlavorTermsDisclosure instanceId="search-browse" className="mt-1" />
    </div>
  )
}

/** "More rich" / "Kräftig: mehr" — the chip and the list head's words for a flavor filter. */
export async function flavorWords(flavor: FlavorFilter, locale: Locale): Promise<string> {
  const t = await getTranslations('search.browse')
  const tAxis = await getTranslations('flavorAxis')
  const axis = tAxis(`${flavor.axis as FlavorAxis}.label`)
  return t(flavor.direction === 'more' ? 'moreAxis' : 'lessAxis', { axis, axisLower: axis.toLocaleLowerCase(locale) })
}
