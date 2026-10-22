import { getFormatter, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { journalFilterQuery, parseJournalFilter } from '@/lib/collection/journal-filter'
import type { JournalNumbers } from '@/lib/collection/journal-stats'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'

/**
 * "Your journal in numbers" at the end of §12 (design question X, built ahead
 * of the spec): counts, the stars, the prefectures and the breweries of the
 * visitor's own tastings. Every bar opens the journal filtered to it, so a
 * number is a way in, not just a fact. Prefectures and breweries come from
 * Sakenowa; the screen's end-of-screen block carries the credit.
 */
export async function JournalNumbersSection({ numbers, locale }: { numbers: JournalNumbers; locale: string }) {
  const t = await getTranslations('palate.numbers')
  const format = await getFormatter({ locale })
  const decimal = (n: number) => format.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
  const maxStars = Math.max(...Object.values(numbers.stars.spread), 1)
  const maxPlace = Math.max(...numbers.prefectures.top.map((p) => p.count), 1)
  const journalLink = (query: Record<string, string>) => ({
    pathname: '/collection' as const,
    query: journalFilterQuery(parseJournalFilter(query)),
  })

  return (
    <section className="flex flex-col gap-5" data-testid="journal-numbers">
      <h2 className="text-card-heading font-medium text-ink">{t('heading')}</h2>

      <dl className="grid grid-cols-2 gap-3">
        {[
          { key: 'tastings', value: numbers.tastings, label: t('tastings', { n: numbers.tastings }) },
          { key: 'sakes', value: numbers.sakes, label: t('sakes', { n: numbers.sakes }) },
          { key: 'breweries', value: numbers.breweries, label: t('breweries', { n: numbers.breweries }) },
          { key: 'prefectures', value: numbers.prefectures.tasted, label: t('prefectures') },
        ].map((item) => (
          <div key={item.key} className="flex flex-col rounded-lg border border-divider px-3 py-2.5" data-testid={`journal-numbers-${item.key}`}>
            <dd className="text-title font-medium text-ink">{item.value}</dd>
            <dt className="text-meta text-ash-600">{item.label}</dt>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="flex items-baseline justify-between text-subtle font-medium text-ink">
          {t('starsHeading')}
          {numbers.stars.average !== null && (
            <span className="text-meta font-normal text-ash-600">{t('average', { average: decimal(numbers.stars.average) })}</span>
          )}
        </h3>
        <ul className="flex flex-col gap-1" role="list">
          {([5, 4, 3, 2, 1] as const).map((stars) => {
            const count = numbers.stars.spread[stars]
            return (
              <li key={stars}>
                <Bar
                  href={count > 0 ? journalLink({ stars: String(stars) }) : null}
                  label={t('starsRow', { n: stars })}
                  count={count}
                  share={count / maxStars}
                  aria={t('barLabel', { label: t('starsRow', { n: stars }), count })}
                />
              </li>
            )
          })}
        </ul>
      </div>

      {numbers.prefectures.top.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-subtle font-medium text-ink">{t('placesHeading')}</h3>
          <ul className="flex flex-col gap-1" role="list" data-testid="journal-numbers-places">
            {numbers.prefectures.top.map(({ value, count }) => {
              const name = getPrefectureNames(value)?.nameEn ?? String(value)
              return (
                <li key={value}>
                  <Bar
                    href={journalLink({ pref: String(value) })}
                    label={name}
                    count={count}
                    share={count / maxPlace}
                    aria={t('barLabel', { label: name, count })}
                  />
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {numbers.topBreweries.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-subtle font-medium text-ink">{t('breweriesHeading')}</h3>
          <ul className="flex flex-col" role="list" data-testid="journal-numbers-breweries">
            {numbers.topBreweries.map(({ brewery, count, average }) => (
              <li key={brewery.id} className="flex flex-col border-b border-divider py-2 last:border-b-0">
                <span className="text-body text-ink">
                  {brewery.nameRomaji ?? <span lang="ja">{brewery.nameKanji}</span>}
                  {brewery.nameRomaji && (
                    <span lang="ja" className="ml-2 text-meta text-ash-600">
                      {brewery.nameKanji}
                    </span>
                  )}
                </span>
                <span className="text-meta text-ash-600">{t('breweryLine', { count, average: decimal(average) })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Bar({
  href,
  label,
  count,
  share,
  aria,
}: {
  href: { pathname: '/collection'; query: Record<string, string> } | null
  label: string
  count: number
  share: number
  aria: string
}) {
  const body = (
    <>
      <span className="w-24 shrink-0 truncate text-meta text-ink">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-ash-200" aria-hidden="true">
        <span className="block h-full rounded-full bg-ginshu-600" style={{ width: `${Math.round(share * 100)}%` }} />
      </span>
      <span className="w-6 shrink-0 text-right text-meta text-ash-600">{count}</span>
    </>
  )
  const className = 'flex min-h-9 items-center gap-3 rounded-sm px-1'
  return href ? (
    <Link
      href={href}
      aria-label={aria}
      className={`${className} transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600`}
    >
      {body}
    </Link>
  ) : (
    <span className={className} aria-label={aria} role="img">
      {body}
    </span>
  )
}
