import { getTranslations } from 'next-intl/server'
import { ArrowRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { ratingStars } from '@/lib/taste/rating-stars'
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
          href="/collection"
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
              {/*
                The bottle slot. We have no bottle photography and the
                catalogue carries none, so this is the design's own
                placeholder — `aria-hidden` because the name beside it is the
                content.
              */}
              <span
                aria-hidden="true"
                className="h-14 w-10 shrink-0 rounded-md bg-ash-300"
                data-testid="home-recent-bottle-slot"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-card-heading font-medium text-ink" lang="ja">
                  {entry.sake.nameKanji}
                </span>
                {entry.sake.nameRomaji && (
                  <span className="truncate text-meta text-ash-600" lang="en">
                    {entry.sake.nameRomaji}
                  </span>
                )}
                <span
                  className="text-meta text-ginshu-600"
                  aria-label={tJournal('ratingStars', { rating })}
                >
                  {ratingStars(rating)}
                </span>
              </span>
              <span className="shrink-0 self-start text-meta text-ash-600">
                {t(`age.${age.unit}`, { count: age.value })}
              </span>
            </>
          )
          return (
            <li key={entry.id} data-testid="home-recent-entry">
              {brandId !== null ? (
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
