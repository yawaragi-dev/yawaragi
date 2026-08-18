import { getFormatter, getTranslations } from 'next-intl/server'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import { SakenowaAttribution } from '@/components/sake/sakenowa-attribution'
import { JournalLogForm } from '@/components/profile/journal/journal-log-form'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { groupJournalByMonth } from '@/lib/taste/group-journal-by-month'

// A faded illustrative map shown behind the empty state (no data, no Sakenowa
// attribution — same posture as the anonymous cold-start sample).
const EMPTY_SAMPLE: FlavorProfile = { f1: 0.62, f2: 0.55, f3: 0.4, f4: 0.48, f5: 0.3, f6: 0.58 }

const stars = (rating: number) => '★'.repeat(rating) + '☆'.repeat(5 - rating)

interface JournalViewProps {
  entries: readonly JournalEntry[]
  /** Derived TasteMap; `null` in the empty state. */
  profile: FlavorProfile | null
  locale: string
}

/**
 * The maintainer's TastingJournal surface (ADR-0020, P5.5-C) — "map hero +
 * timeline" (the chosen layout). The derived TasteMap is the hero; the journal
 * entries are a month-grouped, newest-first timeline below; logging is a
 * floating action button that opens a slide-over form (the client island).
 *
 * Async RSC: its public interface is the rendered page, so it's covered by a
 * Playwright E2E (via the `yawaragi_journal_stub` seam), not a Vitest unit test.
 */
export async function JournalView({ entries, profile, locale }: JournalViewProps) {
  const t = await getTranslations('journal')
  const format = await getFormatter({ locale })
  const isEmpty = entries.length === 0
  const groups = groupJournalByMonth(entries)

  return (
    <div className="flex flex-col gap-10" data-testid="journal-view">
      {/* Map hero */}
      <section className="flex flex-col items-center gap-3 text-center">
        <h2 className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">{t('mapHeading')}</h2>
        <div className={`w-full max-w-md ${isEmpty ? 'opacity-40' : ''}`}>
          <FlavorRadarView profile={profile ?? EMPTY_SAMPLE} />
        </div>
        {isEmpty ? (
          <p className="max-w-md text-sm text-zinc-500">{t('emptyMapCaption')}</p>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {t('shapedBy', { count: entries.length })}
          </p>
        )}
        {/* Attribution rides on the surface in BOTH states: even when empty, the
            log form (always present via the FAB) surfaces Sakenowa brand names. */}
        <SakenowaAttribution placement="inline" />
      </section>

      {/* Empty state vs timeline */}
      {isEmpty ? (
        <section
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 py-12 text-center dark:border-zinc-700"
          data-testid="journal-empty"
        >
          <h3 className="text-lg font-medium">{t('emptyHeading')}</h3>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{t('emptyBody')}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-8" data-testid="journal-timeline">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {format.dateTime(new Date(group.firstDay), {
                  year: 'numeric',
                  month: 'long',
                  timeZone: 'UTC',
                })}
              </h3>
              <ol className="flex flex-col gap-4 border-l border-zinc-200 pl-5 dark:border-zinc-800">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="relative" data-testid="journal-entry">
                    <span className="absolute -left-[27px] top-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-400 dark:border-zinc-950" />
                    <article className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xl" lang="ja">
                            {entry.sake.nameKanji}
                          </div>
                          {entry.sake.nameRomaji && (
                            <div className="text-sm text-zinc-500">{entry.sake.nameRomaji}</div>
                          )}
                          <div className="text-xs text-zinc-400">
                            {format.dateTime(new Date(entry.triedAt), {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              timeZone: 'UTC',
                            })}
                          </div>
                        </div>
                        <span className="whitespace-nowrap text-amber-500" aria-label={t('ratingStars', { rating: ratingOf(entry) })}>
                          {stars(ratingOf(entry))}
                        </span>
                      </div>
                      {entry.notes && (
                        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{entry.notes}</p>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      <JournalLogForm />
    </div>
  )
}

/** A rating entry carries its stars; other kinds default to a neutral 3. */
function ratingOf(entry: JournalEntry): number {
  return entry.event.kind === 'rating' ? entry.event.rating : 3
}
