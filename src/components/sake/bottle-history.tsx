import { getFormatter, getTranslations } from 'next-intl/server'
import { BottleSection } from '@/components/sake/bottle-section'
import { StarRow } from '@/components/journal/star-row'
import { EditableTasting } from '@/components/sake/editable-tasting'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * §9.3 "You and this sake" — the visitor's own tastings of this bottle, newest
 * first: a date block, the stars, the note in italics. "Not tasted yet." when
 * there are none. Reference screenshot 16.
 *
 * Dates are formatted in UTC, like §11's journal list, so one tasting shows
 * the same day on both screens.
 *
 * Each row has an Edit that opens the tasting in §5's panel, where it can be
 * changed or deleted (`<EditableTasting />`, interim until #308 answers).
 *
 * Rendered only for a visitor who can keep a journal (ADR-0020); for everyone
 * else "Not tasted yet." with no way to change it would be a dead end dressed
 * as an empty state, which is why this section was left out until now.
 */
export async function BottleHistory({
  brandId,
  chart,
  entries,
  locale,
  subject = 'sake',
}: {
  brandId: number
  /** The sake's chart, for the quick chips when a tasting is edited. */
  chart: FlavorChart | null
  /** This sake's entries, newest first. */
  entries: readonly JournalEntry[]
  locale: string
  /** §9a's page lists one bottling's tastings under "You and this bottling";
   *  the sake's page lists them all and names the bottling on each (v1.6 §9). */
  subject?: 'sake' | 'bottling'
}) {
  const t = await getTranslations('tasting')
  const tJournal = await getTranslations('journal')
  const format = await getFormatter({ locale })

  return (
    <BottleSection
      label={t(subject === 'bottling' ? 'historyHeadingBottling' : 'historyHeading')}
      caption={entries.length > 0 ? t('historyCount', { n: entries.length }) : undefined}
      testId="bottle-history"
    >
      {entries.length === 0 ? (
        <p className="text-subtle text-ash-700" data-testid="bottle-history-empty">
          {t('notTastedYet')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {entries.map((entry, i) => {
            const rating = entry.event.kind === 'rating' ? entry.event.rating : null
            return (
              <EditableTasting
                key={entry.id}
                brandId={brandId}
                sakeName={entry.expression?.name ?? entry.sake.nameRomaji ?? entry.sake.nameKanji}
                chart={chart}
                tasting={{
                  entryId: entry.id,
                  rating: rating ?? 0,
                  notes: entry.notes,
                  tags: entry.tags,
                  detail: entry.detail,
                  triedAt: entry.triedAt,
                  // Newest first, so the first row is the latest tasting.
                  tastingNumber: entries.length - i,
                }}
              >
                <span className="flex w-8 shrink-0 flex-col items-center">
                  <span className="text-card-heading leading-none text-ink">
                    {format.dateTime(new Date(entry.triedAt), { day: '2-digit', timeZone: 'UTC' })}
                  </span>
                  <span className="mt-0.5 text-micro uppercase tracking-[0.08em] text-ash-600">
                    {format.dateTime(new Date(entry.triedAt), { month: 'short', timeZone: 'UTC' })}
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  {subject === 'sake' && entry.expression && (
                    // v1.6 §9: a bottling's tasting leads with the bottling name.
                    <span className="text-subtle font-medium text-ink" data-testid="bottle-history-bottling">
                      {entry.expression.name}
                    </span>
                  )}
                  {rating !== null && (
                    <span role="img" aria-label={tJournal('ratingStars', { rating })}>
                      <StarRow value={rating} />
                    </span>
                  )}
                  {entry.notes && (
                    <span className="text-subtle italic text-ash-700">“{entry.notes}”</span>
                  )}
                </span>
              </EditableTasting>
            )
          })}
        </ul>
      )}
    </BottleSection>
  )
}
