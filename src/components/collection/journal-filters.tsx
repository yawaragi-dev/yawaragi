import { CaretDown, CaretUp, MagnifyingGlass, MapPin, Seal, SlidersHorizontal, Star } from '@phosphor-icons/react/dist/ssr'
import { getFormatter, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import {
  type Facet,
  type JournalFacets,
  type JournalFilter,
  hasValue,
  isFiltered,
  journalFilterQuery,
  toggleValue,
} from '@/lib/collection/journal-filter'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { gradeLabel } from '@/lib/scan/read-bottling'
import { cn } from '@/lib/utils'

export type JournalChip = 'prefecture' | 'rating' | 'grade' | 'more'

const CHIPS: readonly JournalChip[] = ['prefecture', 'rating', 'grade', 'more']

/** The query a link keeps: the filter, the open chip and whether the search field is up. */
function href(filter: JournalFilter, open: JournalChip | null, search: boolean) {
  const query: Record<string, string | string[]> = journalFilterQuery(filter)
  if (open) query.open = open
  if (search) query.find = '1'
  return { pathname: '/collection' as const, query }
}

/**
 * §11's journal filters (design v1.9, W; 118–120). A row of chips —
 * Prefecture, Rating, Grade, More (Style, Brewery, Month) — under the
 * segmented control; tapping one opens its values below the row. Several
 * values in one chip mean "any of", chips together "all of"; each value
 * counts the tastings it would leave with the other filters on. Every
 * control is a link with the filter in the URL, so it works without
 * JavaScript and Back undoes a tap.
 */
export async function JournalFilters({
  filter,
  facets,
  shown,
  total,
  open,
  search,
}: {
  filter: JournalFilter
  facets: JournalFacets
  shown: number
  total: number
  /** The chip whose values are open below the row. */
  open: JournalChip | null
  /** The search field is up (§11's search icon, W2). */
  search: boolean
}) {
  const t = await getTranslations('collection.filters')
  const format = await getFormatter()
  const prefName = (id: number) => getPrefectureNames(id)?.nameEn ?? String(id)
  const starsName = (band: number) => (band === 5 ? t('fiveStars') : t('starBand', { from: band, to: `${band}.5` }))
  const monthName = (month: string) =>
    format.dateTime(new Date(`${month}-01T00:00:00Z`), { month: 'short', year: 'numeric', timeZone: 'UTC' })

  const summaryOf = <V,>(values: readonly V[], name: (v: V) => string) =>
    values.length === 0 ? null : values.length === 1 ? name(values[0]!) : `${name(values[0]!)} +${values.length - 1}`
  const breweryName = (id: number) => {
    const found = facets.breweries.find((f) => f.value.id === id)?.value
    return found ? (found.nameRomaji ?? found.nameKanji) : String(id)
  }
  const chipLabel: Record<JournalChip, string> = {
    prefecture: summaryOf(filter.areaIds, prefName) ?? t('prefecture'),
    rating: summaryOf(filter.stars, starsName) ?? t('rating'),
    grade: summaryOf(filter.grades, gradeLabel) ?? t('grade'),
    more:
      summaryOf([...filter.styles, ...filter.breweries.map(breweryName), ...filter.months.map(monthName)], (x) => x) ??
      t('more'),
  }
  const chipOn: Record<JournalChip, boolean> = {
    prefecture: filter.areaIds.length > 0,
    rating: filter.stars.length > 0,
    grade: filter.grades.length > 0,
    more: filter.styles.length + filter.breweries.length + filter.months.length > 0,
  }
  const icons: Record<JournalChip, React.ReactNode> = {
    prefecture: <MapPin size={15} aria-hidden="true" />,
    rating: <Star size={15} aria-hidden="true" />,
    grade: <Seal size={15} aria-hidden="true" />,
    more: <SlidersHorizontal size={15} aria-hidden="true" />,
  }

  const values = <V,>(
    list: Facet<V>[],
    label: (v: V) => string,
    on: (v: V) => boolean,
    next: (v: V) => JournalFilter,
    key: (v: V) => string,
  ) => (
    <ul className="flex flex-wrap gap-2" role="list">
      {list.map((facet) => (
        <li key={key(facet.value)}>
          <Link
            href={href(next(facet.value), open, search)}
            aria-current={on(facet.value) ? 'true' : undefined}
            scroll={false}
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
              on(facet.value) ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
            )}
            data-testid={`journal-filter-${open}-option`}
          >
            {label(facet.value)}
            <span className="text-ash-600">{facet.count}</span>
          </Link>
        </li>
      ))}
    </ul>
  )

  const filtered = isFiltered(filter)
  const summaryNames = [
    ...filter.areaIds.map(prefName),
    ...filter.stars.map(starsName),
    ...filter.grades.map(gradeLabel),
    ...filter.styles,
    ...filter.breweries.map(breweryName),
    ...filter.months.map(monthName),
    ...(filter.q ? [`“${filter.q}”`] : []),
  ]

  return (
    <section className="flex flex-col gap-3" aria-label={t('label')} data-testid="journal-filters">
      {(search || filter.q) && (
        <form action="" method="get" role="search" className="flex" data-testid="journal-search">
          {/* The filter rides along, so searching keeps the chips' choices. */}
          {Object.entries(journalFilterQuery({ ...filter, q: null })).flatMap(([name, value]) =>
            (Array.isArray(value) ? value : [value]).map((v) => <input key={`${name}-${v}`} type="hidden" name={name} value={v} />),
          )}
          <input type="hidden" name="find" value="1" />
          <label className="flex min-h-12 flex-1 items-center gap-2.5 rounded-lg border border-ginshu-500 px-3.5 focus-within:ring-2 focus-within:ring-ginshu-600">
            <MagnifyingGlass size={18} aria-hidden="true" className="shrink-0 text-ash-600" />
            <span className="sr-only">{t('searchLabel')}</span>
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              name="q"
              defaultValue={filter.q ?? ''}
              maxLength={80}
              placeholder={t('searchPlaceholder')}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ash-500 focus:outline-none"
              data-testid="journal-search-input"
            />
          </label>
        </form>
      )}

      <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none]">
        <div className="flex w-max gap-2">
          {CHIPS.map((chip) => (
            <Link
              key={chip}
              href={href(filter, open === chip ? null : chip, search)}
              scroll={false}
              aria-expanded={open === chip}
              className={cn(
                'flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                chipOn[chip] || open === chip ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
              )}
              data-testid={`journal-filter-${chip}`}
            >
              {icons[chip]}
              {chipLabel[chip]}
              {open === chip ? <CaretUp size={13} aria-hidden="true" /> : <CaretDown size={13} aria-hidden="true" />}
            </Link>
          ))}
        </div>
      </div>

      {open === 'prefecture' &&
        values(facets.prefectures, prefName, (v) => hasValue(filter, 'areaIds', v), (v) => toggleValue(filter, 'areaIds', v), String)}
      {open === 'rating' &&
        values(facets.stars, starsName, (v) => hasValue(filter, 'stars', v), (v) => toggleValue(filter, 'stars', v), String)}
      {open === 'grade' && (
        <div className="flex flex-col gap-2">
          {values(facets.grades, gradeLabel, (v) => hasValue(filter, 'grades', v), (v) => toggleValue(filter, 'grades', v), String)}
          {facets.noGrade > 0 && (
            <p className="text-meta text-ash-700" data-testid="journal-filter-no-grade">
              {t('noGrade', { count: facets.noGrade })}
            </p>
          )}
        </div>
      )}
      {open === 'more' && (
        <div className="flex flex-col gap-3">
          {facets.styles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-micro uppercase tracking-wide text-ash-600">{t('style')}</h3>
              {values(facets.styles, (v) => v, (v) => hasValue(filter, 'styles', v), (v) => toggleValue(filter, 'styles', v), (v) => v.toLocaleLowerCase())}
            </div>
          )}
          {facets.breweries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-micro uppercase tracking-wide text-ash-600">{t('brewery')}</h3>
              {values(
                facets.breweries,
                (v) => v.nameRomaji ?? v.nameKanji,
                (v) => hasValue(filter, 'breweries', v.id),
                (v) => toggleValue(filter, 'breweries', v.id),
                (v) => String(v.id),
              )}
            </div>
          )}
          {facets.months.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-micro uppercase tracking-wide text-ash-600">{t('month')}</h3>
              {values(facets.months, monthName, (v) => hasValue(filter, 'months', v), (v) => toggleValue(filter, 'months', v), (v) => v)}
            </div>
          )}
        </div>
      )}

      {filtered && (
        <p className="flex items-baseline justify-between gap-3 text-meta text-ash-600" data-testid="journal-filter-summary">
          <span>
            {t('shown', { shown, total })}
            {summaryNames.length > 0 && ` · ${summaryNames.join(' · ')}`}
          </span>
          <Link
            href={{ pathname: '/collection', query: { tab: 'journal' } }}
            scroll={false}
            className="shrink-0 font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="journal-filter-clear"
          >
            {t('clear')}
          </Link>
        </p>
      )}
    </section>
  )
}

/** §11's search icon beside the avatar (W2): opens the field above the chips, or closes it. */
export async function JournalSearchToggle({ filter, open, search }: { filter: JournalFilter; open: JournalChip | null; search: boolean }) {
  const t = await getTranslations('collection.filters')
  const up = search || filter.q !== null
  return (
    <Link
      href={href(up ? { ...filter, q: null } : filter, open, !up)}
      scroll={false}
      aria-label={t('searchLabel')}
      aria-expanded={up}
      className={cn(
        'flex size-10 items-center justify-center rounded-full border text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
        up ? 'border-ginshu-500 bg-ginshu-100' : 'border-ash-300 hover:bg-ash-100',
      )}
      data-testid="journal-search-toggle"
    >
      <MagnifyingGlass size={18} aria-hidden="true" />
    </Link>
  )
}
