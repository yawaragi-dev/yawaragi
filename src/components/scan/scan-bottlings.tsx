'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { AddBottlingRow } from '@/components/sake/add-bottling-row'

/**
 * Under a matched result card, for a visitor who keeps a journal: what the
 * scan knows about the bottling, beyond the sake it matched.
 *
 * - "Is it one of these bottlings?" (design v1.6 §5, screenshot 54) when the
 *   visitor already has bottlings of this sake: a row each, the one the
 *   label's product name or grade points at first and marked as fitting.
 * - "Add this bottling" with the name read off the label, when the label
 *   says more than the sake's name. The design shows this row only beside
 *   known bottlings and starts it from the line's name; offering it on its
 *   own, already filled in, is ahead of the spec (docs/design-questions.md).
 *
 * Renders nothing when there is neither.
 */
export function ScanBottlings({
  brandId,
  lineName,
  suggestedName,
  own,
  badge,
}: {
  brandId: number
  lineName: string
  suggestedName: string | null
  own: readonly { id: string; name: string; fitsLabel: boolean }[]
  /** The Read by AI badge, rendered by the caller (it owns the sheet). */
  badge: ReactNode
}) {
  const t = useTranslations('bottling')
  if (own.length === 0 && !suggestedName) return null

  return (
    <section className="flex flex-col gap-2" data-testid="scan-bottlings">
      {own.length > 0 && (
        <>
          <h3 className="text-section-label uppercase text-ash-600">{t('oneOfThese')}</h3>
          <p className="text-subtle text-ash-700">{t('oneOfTheseLead')}</p>
          <ul className="flex flex-col" role="list">
            {own.map((bottling) => (
              <li key={bottling.id} className="border-b border-divider">
                <Link
                  href={{ pathname: '/bottling/[id]', params: { id: bottling.id } }}
                  className="flex min-h-14 items-center gap-3 py-2.5 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid={`scan-bottling-${bottling.id}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-card-heading font-medium text-ink">{bottling.name}</span>
                    <span className="text-meta text-ash-700">
                      {bottling.fitsLabel ? t('fitsLabel') : t('ownEntry')}
                    </span>
                  </span>
                  <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      {suggestedName && (
        // The name comes from the model's read of the label, so it carries
        // the same badge as every other value read by AI.
        <div className="flex items-center justify-between gap-3 pt-1" data-testid="scan-bottlings-read">
          <span className="text-section-label uppercase text-ash-600">{t('readOffLabel')}</span>
          {badge}
        </div>
      )}
      <AddBottlingRow brandId={brandId} lineName={lineName} suggestedName={suggestedName ?? undefined} />
    </section>
  )
}
