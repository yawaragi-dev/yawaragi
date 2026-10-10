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
  sakeName,
  chart,
  history,
  similar,
  cellar,
  initiallyOpen = false,
}: {
  brandId: number
  /** The name the page shows; the delete confirmation names it. */
  sakeName: string
  chart: Readonly<Record<FlavorAxis, number>> | null
  history: TastingHistoryMeta
  similar: ReactNode
  /** §9's cellar control, rendered by the page. */
  cellar: ReactNode
  /** Open the panel straight away — the Cellar's "Pour & rate" lands here. */
  initiallyOpen?: boolean
}) {
  const t = useTranslations('tasting')
  const [open, setOpen] = useState(initiallyOpen)

  if (open) {
    // The panel takes the button's slot, right under the identity, and the
    // cellar control moves up beside "Similar" — rather than "Similar" left
    // alone in a row, with the panel opening below everything else.
    return (
      <div className="flex flex-col gap-3">
        {/* "Done" closes the panel back to "Rate a new tasting"; the tasting
            is already in "You and this sake" below. */}
        <TastingLogPanel brandId={brandId} sakeName={sakeName} chart={chart} history={history} onDone={() => setOpen(false)} />
        <div className="flex gap-2" data-testid="bottle-actions">
          {cellar}
          {similar}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" data-testid="bottle-actions">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="bottle-rate-open"
        >
          <Star size={17} aria-hidden="true" />
          {t('rateNewTasting')}
        </button>
        {similar}
      </div>
      {/* §9 puts wishlist and cellar as icons in its own header, which is not
          ported (the shell header carries the wordmark). Until it is, the
          cellar control sits under the action row, as §5 places it under
          the card. */}
      <div className="flex gap-2">{cellar}</div>
    </div>
  )
}
