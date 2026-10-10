'use client'

import { type ReactNode, useState } from 'react'
import { useTranslations } from 'next-intl'
import { PencilSimple } from '@phosphor-icons/react/dist/ssr'
import { type ExistingTasting, TastingLogPanel } from '@/components/journal/tasting-log-panel'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'

/**
 * One row of §9.3 "You and this sake", with an Edit that opens the tasting in
 * §5's panel right under it: stars, note, chips, detailed notes, and a
 * confirmed Delete. Interim — the design has no edit or delete for a tasting
 * yet (#308, #286); this puts both one tap from the tasting itself.
 *
 * The row's content is rendered by the server (`children`); this only adds
 * the button and the panel.
 */
export function EditableTasting({
  brandId,
  sakeName,
  chart,
  tasting,
  children,
}: {
  /** The sake, or `null` for a bottling whose sake the catalogue lacks. */
  brandId: number | null
  sakeName: string
  chart: Readonly<Record<FlavorAxis, number>> | null
  tasting: ExistingTasting
  children: ReactNode
}) {
  const t = useTranslations('tasting')
  const [open, setOpen] = useState(false)

  return (
    <li className="flex flex-col gap-2" data-testid="bottle-history-entry">
      <div className="flex gap-3 rounded-md bg-surface px-3 py-2.5 shadow-yw-sm">
        {children}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-9 shrink-0 items-center gap-1 self-start rounded-md px-2 text-meta text-ash-700 transition-colors hover:bg-ash-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid={`bottle-history-edit-${tasting.entryId}`}
          >
            <PencilSimple size={14} aria-hidden="true" />
            {t('edit')}
          </button>
        )}
      </div>
      {open && (
        <TastingLogPanel
          brandId={brandId}
          sakeName={sakeName}
          chart={chart}
          history={null}
          existing={tasting}
          onDone={() => setOpen(false)}
          // The row goes with the refresh that follows a delete.
          onDeleted={() => setOpen(false)}
        />
      )}
    </li>
  )
}
