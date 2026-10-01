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
  const t = await getTranslations('palate')
  const { ratings, scans, seedDescriptors } = summarizeTasteEvents(events)

  const parts = [
    ratings > 0 ? t('shapedByRatings', { count: ratings }) : null,
    scans > 0 ? t('shapedByScans', { count: scans }) : null,
    seedDescriptors.length > 0 ? t('shapedBySeeds', { count: seedDescriptors.length }) : null,
  ].filter((part): part is string => part !== null)

  return (
    <div className="flex flex-col gap-1" data-testid="taste-provenance-summary">
      {/* Ginshu, as of §12's port: the zinc `dark:` halves rendered for
          everyone once #303 forced the variant, and zinc is a cool grey on a
          warm ground (ADR-0023). */}
      <h2 className="text-section-label uppercase text-ash-600">{t('shapedByHeading')}</h2>
      <p className="text-body text-ash-600">{parts.join(' · ')}</p>
      {seedDescriptors.length > 0 && (
        <p
          className="text-meta text-ash-700"
          data-testid="taste-provenance-seeds"
        >
          {t('shapedBySeedList', { descriptors: seedDescriptors.join(', ') })}
        </p>
      )}
    </div>
  )
}
