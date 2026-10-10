import { getTranslations } from 'next-intl/server'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { StarRow } from '@/components/journal/star-row'
import { relativeAge } from '@/lib/home/relative-age'

/**
 * §3's "Recent tastings" — the three most recent, as cards.
 *
 * Deliberately NOT `<JournalList />`. §11's row is a date block, a name and
 * stars, because that list is the record; §3's card carries a bottle slot, the
 * brewery and place, and a *relative* age ("2d", "1w"), because this one is a
 * reminder. Same data, two readings — folding them into one component with a
 * variant flag would mean every future change to either has to reason about
 * both.
 *
 * "All {n} →" leads to §11, which is the complete list.
 */
export async function HomeRecentTastings({
  entries,
  totalCount,
  now,
}: {
  /** Already newest-first and already sliced to what §3 shows. */
  entries: readonly JournalEntry[]
  /** The whole journal's size, for the "All {n}" link. */
  totalCount: number
  /** Injected so the relative ages are not a clock read inside render. */
  now: number
}) {
  const t = await getTranslations('home')
  const tJournal = await getTranslations('journal')

  return (
    <section className="flex flex-col gap-2" data-testid="home-recent-tastings">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-section-label uppercase text-ash-600">{t('recentHeading')}</h2>
        <Link
          // Names its segment: Collection otherwise opens on the last one
          // the visitor used, and "See all" is about tastings.
          href={{ pathname: '/collection', query: { tab: 'journal' } }}
          className="inline-flex items-center gap-1 rounded-sm text-meta text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="home-recent-all"
        >
          {/* The arrow is the icon, not a character in the string — the
              design draws "All 3 →" and having both rendered it twice. */}
          {t('recentAll', { count: totalCount })}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <ul className="flex flex-col gap-2" role="list">
        {entries.map((entry) => {
          const rating = entry.event.kind === 'rating' ? entry.event.rating : 3
          const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
          const age = relativeAge(entry.triedAt, now)
          const card = (
            <>
              {/* No bottle slot: v1.5 rule 14 ("no image, no slot") and §3's recent
                  rows, which are text-only. */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Latin name first, kanji under it — screenshot 04, and the
                    journal's order. */}
                {entry.expression ? (
                  // v1.6: a bottling's tasting leads with the bottling name.
                  <span className="truncate text-card-heading font-medium text-ink">
                    {entry.expression.name}
                  </span>
                ) : (
                  <span
                    className="truncate text-card-heading font-medium text-ink"
                    lang={entry.sake.nameRomaji ? 'en' : 'ja'}
                  >
                    {entry.sake.nameRomaji ?? entry.sake.nameKanji}
                  </span>
                )}
                {(entry.expression
                  ? entry.expression.name !== entry.sake.nameKanji
                  : entry.sake.nameRomaji) && (
                  <span className="truncate text-meta text-ash-600" lang="ja">
                    {entry.sake.nameKanji}
                  </span>
                )}
                <span role="img" className="pt-0.5" aria-label={tJournal('ratingStars', { rating })}>
                  <StarRow value={rating} size={12} />
                </span>
              </span>
              <span className="shrink-0 self-start text-meta text-ash-600">
                {t(`age.${age.unit}`, { count: age.value })}
              </span>
            </>
          )
          return (
            <li key={entry.id} data-testid="home-recent-entry">
              {entry.expression ? (
                <Link
                  href={{ pathname: '/bottling/[id]', params: { id: entry.expression.id } }}
                  className="flex min-h-16 items-center gap-3 rounded-xl bg-surface p-3 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid={`home-recent-bottling-link-${entry.expression.id}`}
                >
                  {card}
                </Link>
              ) : brandId !== null ? (
                <Link
                  href={{ pathname: '/sake/[brandId]', params: { brandId: String(brandId) } }}
                  className="flex min-h-16 items-center gap-3 rounded-xl bg-surface p-3 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid={`home-recent-link-${brandId}`}
                >
                  {card}
                </Link>
              ) : (
                <div className="flex min-h-16 items-center gap-3 rounded-xl bg-surface p-3 shadow-yw-sm">
                  {card}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
