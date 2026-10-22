import { CaretDown } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import {
  type Facet,
  type JournalFacets,
  type JournalFilter,
  isFiltered,
  journalFilterQuery,
  withJournalFilter,
} from '@/lib/collection/journal-filter'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { gradeLabel } from '@/lib/scan/read-bottling'
import { cn } from '@/lib/utils'

/**
 * Filter chips over §11's journal (design question W, built ahead of the
 * spec), in the shape of §8's browse chips: each opens in place with the
 * values this journal has, each with how many tastings it keeps, and every
 * value is a link to `/collection` with the filter changed — so it works
 * without JavaScript and the filter lives in the URL. A chip with nothing to
 * offer is not shown.
 */
export async function JournalFilters({
  filter,
  facets,
  shown,
  total,
}: {
  filter: JournalFilter
  facets: JournalFacets
  shown: number
  total: number
}) {
  const t = await getTranslations('collection.filters')
  const tBottling = await getTranslations('bottling')
  const prefName = (id: number) => getPrefectureNames(id)?.nameEn ?? String(id)
  const filtered = isFiltered(filter)

  const chips = [
    {
      key: 'prefecture',
      label: filter.areaId !== null ? prefName(filter.areaId) : t('prefecture'),
      on: filter.areaId !== null,
      options: facets.prefectures.map((f) => option(f, prefName(f.value), filter.areaId === f.value, { areaId: filter.areaId === f.value ? null : f.value })),
    },
    {
      key: 'stars',
      label: filter.stars !== null ? t('starsValue', { n: filter.stars }) : t('stars'),
      on: filter.stars !== null,
      options: facets.stars.map((f) => option(f, t('starsValue', { n: f.value }), filter.stars === f.value, { stars: filter.stars === f.value ? null : f.value })),
    },
    {
      key: 'grade',
      label: filter.grade !== null ? gradeLabel(filter.grade) : t('grade'),
      on: filter.grade !== null,
      options: facets.grades.map((f) => option(f, gradeLabel(f.value), filter.grade === f.value, { grade: filter.grade === f.value ? null : f.value })),
    },
    {
      key: 'style',
      label: filter.style ?? t('style'),
      on: filter.style !== null,
      options: facets.styles.map((f) => {
        const on = filter.style?.toLocaleLowerCase() === f.value.toLocaleLowerCase()
        return option(f, f.value, on, { style: on ? null : f.value })
      }),
    },
    {
      key: 'koji',
      label: filter.koji !== null ? tBottling(`koji.${filter.koji}`) : t('koji'),
      on: filter.koji !== null,
      options: facets.koji.map((f) => option(f, tBottling(`koji.${f.value}`), filter.koji === f.value, { koji: filter.koji === f.value ? null : f.value })),
    },
  ].filter((chip) => chip.on || chip.options.length > 0)

  if (chips.length === 0) return null

  return (
    <section className="flex flex-col gap-2" aria-label={t('label')} data-testid="journal-filters">
      <div className="flex flex-wrap items-start gap-2">
        {chips.map((chip) => (
          <details key={chip.key} className="group" data-testid={`journal-filter-${chip.key}`}>
            <summary
              className={cn(
                'flex w-fit min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3.5 text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 [&::-webkit-details-marker]:hidden',
                chip.on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
              )}
            >
              {chip.label}
              <CaretDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 flex flex-wrap gap-2" role="list">
              {chip.options.map((o) => (
                <li key={o.key}>
                  <Link
                    href={{ pathname: '/collection', query: journalFilterQuery(withJournalFilter(filter, o.patch)) }}
                    aria-current={o.on ? 'true' : undefined}
                    className={cn(
                      'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                      o.on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
                    )}
                    data-testid={`journal-filter-${chip.key}-option`}
                  >
                    {o.label}
                    <span className="text-ash-600">{o.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
      {filtered && (
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-ash-600" data-testid="journal-filter-summary">
          <span>{t('shown', { shown, total })}</span>
          <span aria-hidden="true">·</span>
          <Link
            href={{ pathname: '/collection', query: { tab: 'journal' } }}
            className="font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="journal-filter-clear"
          >
            {t('clear')}
          </Link>
        </p>
      )}
      {(filter.grade !== null || filter.style !== null || filter.koji !== null) && (
        <p className="text-meta text-ash-600">{t('bottlingOnly')}</p>
      )}
    </section>
  )
}

function option<V>(facet: Facet<V>, label: string, on: boolean, patch: Partial<JournalFilter>) {
  return { key: String(facet.value), label, count: facet.count, on, patch }
}
