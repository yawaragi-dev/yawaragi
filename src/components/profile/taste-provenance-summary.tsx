import { getTranslations } from 'next-intl/server'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { summarizeTasteEvents } from '@/lib/taste/summarize-taste-events'

/**
 * "What shaped this" — a compact, honest read of which TasteEvents built the
 * profile (counts by kind + the cross-beverage descriptors seeded). Provenance
 * without a per-brand DB lookup; the counts + seed descriptors are enough for
 * the visitor to see where their map came from.
 */
export async function TasteProvenanceSummary({ events }: { events: readonly TasteEvent[] }) {
  const t = await getTranslations('profile')
  const { ratings, scans, seedDescriptors } = summarizeTasteEvents(events)

  const parts = [
    ratings > 0 ? t('shapedByRatings', { count: ratings }) : null,
    scans > 0 ? t('shapedByScans', { count: scans }) : null,
    seedDescriptors.length > 0 ? t('shapedBySeeds', { count: seedDescriptors.length }) : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="flex flex-col gap-1" data-testid="taste-provenance-summary">
      <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t('shapedByHeading')}</h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{parts.join(' · ')}</p>
      {seedDescriptors.length > 0 && (
        <p
          className="text-xs text-zinc-500 dark:text-zinc-500"
          data-testid="taste-provenance-seeds"
        >
          {t('shapedBySeedList', { descriptors: seedDescriptors.join(', ') })}
        </p>
      )}
    </div>
  )
}
