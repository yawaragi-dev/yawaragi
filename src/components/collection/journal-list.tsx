import { getFormatter, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { StarRow } from '@/components/journal/star-row'

/**
 * §11's Journal list. Reference screenshot 19.
 *
 * A flat, newest-first list: a date block on the left, the sake and its note
 * in the middle, the stars on the right. It replaces a "map hero + timeline"
 * layout — a radar above a month-grouped, dotted timeline — and losing both
 * halves is the point:
 *
 * - **The radar moved to §12.** The Palate IS the derived six-axis view
 *   (CONTEXT.md); drawing it above the journal too meant a maintainer saw a
 *   radar here and never saw the Palate screen at all, because the journal
 *   branch returned before it.
 * - **The month grouping went with it.** §11 groups nothing: the date block
 *   carries the month on every row, so a heading repeating it is a second
 *   answer to a question already answered. `groupJournalByMonth` keeps its
 *   unit test and its caller is now the one surface that wants months.
 *
 * Each row links to the sake's bottle page, which is where the rest of what we
 * know about it lives. §11's "Full notes" chip is not here: it opens §10's
 * detailed-notes sheet, which is not built, and a chip that opens nothing is
 * the dead affordance #162 forbids.
 */
export async function JournalList({
  entries,
  locale,
}: {
  entries: readonly JournalEntry[]
  locale: string
}) {
  // `journal`, not `collection`: the stars label belongs to the journal and is
  // shared with the log form, so there is one string rather than two copies
  // that can drift.
  const t = await getTranslations('journal')
  const format = await getFormatter({ locale })

  return (
    <ul className="flex flex-col" role="list" data-testid="journal-list">
      {entries.map((entry) => {
        const rating = ratingOf(entry)
        const brandId = entry.event.kind === 'rating' ? entry.event.brandId : null
        const row = (
          <>
            {/* The date block. Day over month, so a column of them reads as a
                calendar edge rather than as a sentence. */}
            <span className="flex w-10 shrink-0 flex-col items-start pt-0.5">
              <span className="text-lg-alt font-medium text-ink">
                {format.dateTime(new Date(entry.triedAt), { day: '2-digit', timeZone: 'UTC' })}
              </span>
              <span className="text-micro uppercase text-ash-600">
                {format.dateTime(new Date(entry.triedAt), { month: 'short', timeZone: 'UTC' })}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {/* Screenshot 19 leads with the Latin name, like the bottle page's
                  title; the kanji follows verbatim on the line §11 gives the
                  brewery, which the entry does not store. */}
              <span className="text-card-heading font-medium text-ink" lang={entry.sake.nameRomaji ? 'en' : 'ja'}>
                {entry.sake.nameRomaji ?? entry.sake.nameKanji}
              </span>
              {entry.sake.nameRomaji && (
                <span className="text-meta text-ash-600" lang="ja">
                  {entry.sake.nameKanji}
                </span>
              )}
              {entry.notes && (
                // Italic, because §11 draws the note as the visitor's own voice
                // quoted back at them — and rule 8 makes italics the register
                // for anything that is not a published fact.
                <span className="text-subtle italic text-ash-700">“{entry.notes}”</span>
              )}
            </span>
            {/* §11: 12px stars, the same glyphs as everywhere else, not text. */}
            <span role="img" className="shrink-0 pt-1" aria-label={t('ratingStars', { rating })}>
              <StarRow value={rating} size={12} />
            </span>
          </>
        )
        return (
          <li
            key={entry.id}
            className="border-b border-divider"
            data-testid="journal-entry"
          >
            {brandId !== null ? (
              <Link
                href={{ pathname: '/sake/[brandId]', params: { brandId: String(brandId) } }}
                className="flex min-h-14 items-start gap-3 py-3 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid={`journal-entry-link-${brandId}`}
              >
                {row}
              </Link>
            ) : (
              // A non-rating entry carries no brandId, so there is nowhere to
              // go. Rendered as text rather than a disabled link: the row is
              // still the record, it just is not a door.
              <div className="flex min-h-14 items-start gap-3 py-3">{row}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A rating entry carries its stars; other kinds default to a neutral 3. */
function ratingOf(entry: JournalEntry): number {
  return entry.event.kind === 'rating' ? entry.event.rating : 3
}
