import { CaretRight, ChartBarHorizontal, Star } from '@phosphor-icons/react/dist/ssr'
import { getFormatter, getTranslations } from 'next-intl/server'
import { FlavorTermsDisclosure } from '@/components/sake/flavor-terms-disclosure'
import { Link } from '@/i18n/navigation'
import { journalFilterQuery, parseJournalFilter } from '@/lib/collection/journal-filter'
import type { JournalNumbers } from '@/lib/collection/journal-stats'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import { gradeLabel } from '@/lib/scan/read-bottling'
import { PrefectureTileMap } from './prefecture-tile-map'

const SECTION = 'text-micro font-medium uppercase tracking-[0.1em] text-ash-600'

/**
 * §12's way in (design v1.9, X1/X4; 125): a row at the end of Palate. From
 * five tastings it opens the screen; before, it is a teaser that does not
 * open.
 */
export async function JournalNumbersRow({ numbers, tastings }: { numbers: JournalNumbers | null; tastings: number }) {
  const t = await getTranslations('palate.numbers')
  const body = (
    <>
      <ChartBarHorizontal size={20} aria-hidden="true" className="shrink-0 text-ginshu-600" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-subtle font-medium text-ink">{t('heading')}</span>
        <span className="text-meta text-ash-600">
          {numbers
            ? t('rowMeta', { tastings: numbers.tastings, prefectures: numbers.prefectures.length })
            : t('teaser', { n: Math.max(1, 5 - tastings) })}
        </span>
      </span>
      {numbers && <CaretRight size={15} aria-hidden="true" className="shrink-0 text-ash-500" />}
    </>
  )
  const box = 'flex w-full items-center gap-3 rounded-md border border-divider px-3.5 py-3 text-left'
  return numbers ? (
    <Link
      href="/profile/numbers"
      className={`${box} transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600`}
      data-testid="journal-numbers-row"
    >
      {body}
    </Link>
  ) : (
    <div className={box} aria-disabled="true" data-testid="journal-numbers-teaser">
      {body}
    </div>
  )
}

const journalAt = (query: Record<string, string>) => ({
  pathname: '/collection' as const,
  query: journalFilterQuery(parseJournalFilter(query)),
})

/** The screen itself (design v1.9, X; 123, 124), in X3's order. */
export async function JournalNumbersScreen({ numbers }: { numbers: JournalNumbers }) {
  const t = await getTranslations('palate.numbers')
  const tAxis = await getTranslations('flavorAxis')
  const format = await getFormatter()
  const decimal = (n: number) => format.number(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const maxStars = Math.max(1, ...Object.values(numbers.stars.spread))
  const maxGrade = Math.max(1, ...numbers.grades.map((g) => g.count))
  const counts = new Map(numbers.prefectures.map((p) => [p.value, p.count]))
  const axisWord = (axis: FlavorAxis) => tAxis(`${axis}.label`).toLocaleLowerCase()
  const surprise = numbers.surprise

  return (
    <div className="flex flex-col gap-6" data-testid="journal-numbers">
      <dl className="grid grid-cols-3 gap-2">
        {(
          [
            ['tastings', numbers.tastings],
            ['sakes', numbers.sakes],
            ['breweries', numbers.breweries],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="flex flex-col rounded-md bg-surface px-3 py-2.5 shadow-yw-sm" data-testid={`journal-numbers-${key}`}>
            <dd className="text-title font-medium leading-none text-ink">{value}</dd>
            <dt className="mt-1.5 text-meta text-ash-700">{t(key, { n: value })}</dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-2.5" aria-labelledby="numbers-places">
        <div className="flex items-baseline justify-between gap-2.5">
          <h2 id="numbers-places" className="flex items-center gap-2 text-card-heading font-medium text-ink">
            <span aria-hidden="true" className="block h-3.5 w-0.5 bg-ginshu-500" />
            {t('prefLine', { n: numbers.prefectures.length })}
          </h2>
          {/* X2: the credit beside the heading of the one Sakenowa-derived part. */}
          <a
            href="https://sakenowa.com"
            target="_blank"
            rel="noopener noreferrer"
            className="whitespace-nowrap text-micro text-ash-700 underline decoration-ash-500 underline-offset-2"
          >
            Powered by Sakenowa ↗
          </a>
        </div>
        <PrefectureTileMap counts={counts} />
        <ul className="flex flex-col" role="list" data-testid="journal-numbers-places">
          {numbers.prefectures.map(({ value, count }) => (
            <li key={value}>
              <Link
                href={journalAt({ pref: String(value) })}
                className="flex min-h-11 items-center gap-2.5 border-b border-divider transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              >
                <span className="flex-1 text-body text-ink">{getPrefectureNames(value)?.nameEn ?? value}</span>
                <span className="text-meta text-ash-700">{t('prefCount', { count })}</span>
                <CaretRight size={13} aria-hidden="true" className="text-ash-500" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className={SECTION}>{t('starsHeading')}</h2>
          {numbers.stars.average !== null && (
            <span className="text-meta text-ash-700">{t('average', { average: decimal(numbers.stars.average) })}</span>
          )}
        </div>
        <ul className="flex flex-col gap-1" role="list">
          {([5, 4, 3, 2, 1] as const).map((band) => {
            const count = numbers.stars.spread[band]
            const label = band === 5 ? t('fiveStars') : t('starBand', { from: band, to: `${band}.5` })
            const row = (
              <>
                <span className="flex w-14 shrink-0 items-center gap-1 text-meta text-ash-800">
                  {label}
                  <Star size={11} weight="fill" aria-hidden="true" className="text-ginshu-600" />
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ash-300" aria-hidden="true">
                  <span className="block h-full bg-ginshu-500" style={{ width: `${Math.round((count / maxStars) * 100)}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-meta text-ash-700">{count}</span>
              </>
            )
            return (
              <li key={band}>
                {count > 0 ? (
                  <Link
                    href={journalAt({ stars: String(band) })}
                    aria-label={t('starsLabel', { label, count })}
                    className="flex min-h-8 items-center gap-2.5 rounded-sm transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  >
                    {row}
                  </Link>
                ) : (
                  <span className="flex min-h-8 items-center gap-2.5" role="img" aria-label={t('starsLabel', { label, count })}>
                    {row}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      {numbers.topBreweries.length > 0 && (
        <section className="flex flex-col gap-0.5">
          <h2 className={`${SECTION} mb-1`}>{t('breweriesHeading')}</h2>
          <ul className="flex flex-col" role="list" data-testid="journal-numbers-breweries">
            {numbers.topBreweries.map(({ brewery, count, average }) => (
              <li key={brewery.id} className="flex items-baseline gap-2.5 border-b border-divider py-2.5">
                <span className="min-w-0 flex-1 text-body text-ink" lang={brewery.nameRomaji ? undefined : 'ja'}>
                  {brewery.nameRomaji ?? brewery.nameKanji}
                </span>
                <span className="text-meta text-ash-700">{t('breweryMeta', { average: decimal(average), count })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-micro text-ash-600">{t('breweriesNote')}</p>
        </section>
      )}

      {numbers.grades.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={SECTION}>{t('gradesHeading')}</h2>
          <ul className="flex flex-col gap-1" role="list">
            {numbers.grades.map(({ value, count }) => (
              <li key={value} className="flex min-h-7 items-center gap-2.5">
                <span className="w-32 shrink-0 text-meta text-ash-800">{gradeLabel(value)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ash-300" aria-hidden="true">
                  <span className="block h-full bg-ash-600" style={{ width: `${Math.round((count / maxGrade) * 100)}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-meta text-ash-700">{count}</span>
              </li>
            ))}
          </ul>
          <p className="text-micro text-ash-600">{t('gradesMeta', { m: numbers.withGrade, n: numbers.tastings })}</p>
        </section>
      )}

      {surprise && (
        <section className="flex flex-col gap-2 rounded-md bg-surface p-3.5 shadow-yw-sm" data-testid="journal-numbers-surprise">
          <h2 className={SECTION}>{t('surpriseHeading')}</h2>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-card-heading font-medium text-ink">
              {surprise.entry.expression?.name ?? surprise.entry.sake.nameRomaji ?? surprise.entry.sake.nameKanji}
            </span>
            {(surprise.entry.expression || surprise.entry.sake.nameRomaji) && (
              <span lang="ja" className="text-meta text-ash-600">
                {surprise.entry.sake.nameKanji}
              </span>
            )}
          </p>
          <p className="text-subtle leading-normal text-ash-800">
            {t('surpriseBody', {
              rating: decimal(surprise.rating),
              its: t('and', { a: axisWord(surprise.itsLean[0]), b: axisWord(surprise.itsLean[1]) }),
              yours: axisWord(surprise.yourLean),
            })}
          </p>
          {/* §17: the flavor words carry their disclosure wherever they appear. */}
          <div className="flex flex-wrap items-baseline gap-x-1 text-micro leading-normal text-ash-700">
            <span>{t('caveat')}</span>
            <FlavorTermsDisclosure instanceId="journal-numbers" />
          </div>
        </section>
      )}

      <p className="text-meta text-ash-600">{t('closing')}</p>
    </div>
  )
}
