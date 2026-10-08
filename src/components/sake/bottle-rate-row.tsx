'use client'

import { type ReactNode, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Star } from '@phosphor-icons/react/dist/ssr'
import {
  type TastingHistoryMeta,
  TastingLogPanel,
} from '@/components/journal/tasting-log-panel'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'

/**
 * §9.2's action row — primary "Rate a new tasting", secondary "Similar" — for
 * a visitor who can keep a journal.
 *
 * In the prototype "Rate a new tasting" opens §5's result card for this sake.
 * Here it opens §5's log panel in place, under the row: the same panel, the
 * same one-tap save, without a second screen that would repeat the identity
 * block the visitor is already looking at. The button gives way to the panel,
 * so there is one way to rate on screen, not two.
 *
 * `similar` is passed in rendered, because its typed `<Link>` belongs to the
 * server page.
 */
export function BottleRateRow({
  brandId,
  chart,
  history,
  similar,
}: {
  brandId: number
  chart: Readonly<Record<FlavorAxis, number>> | null
  history: TastingHistoryMeta
  similar: ReactNode
}) {
  const t = useTranslations('tasting')
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" data-testid="bottle-actions">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="bottle-rate-open"
          >
            <Star size={17} aria-hidden="true" />
            {t('rateNewTasting')}
          </button>
        )}
        {similar}
      </div>
      {open && <TastingLogPanel brandId={brandId} chart={chart} history={history} />}
    </div>
  )
}
