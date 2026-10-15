'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from '@/i18n/navigation'
import { BottlingNameForm } from '@/components/sake/bottling-name-form'
import { addOwnBottling } from '@/lib/collection/expression-actions'
import type { BottlingDetails } from '@/lib/schemas/expression'
import { bottlingNameFromRead, detailsFromRead } from '@/lib/scan/read-bottling'
import { getScannedBottling, subscribeScannedBottling } from '@/lib/scan/scanned-bottling'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge-view'
import { resolveBadgeKind } from '@/lib/provenance/policy'

/**
 * §9's dashed "Add your bottling" row (design v1.6.1, screenshots 63 and 55):
 * one tap opens the form in place — a name field prefilled with the sake's
 * name, a line saying who can see it, "Add bottling" and "Cancel". Saving
 * opens the new bottling's own page (§9a).
 *
 * "Just the name — the rest can wait": Grade, Polishing and Style are there
 * but optional (design v1.7 D5, 84), filled in from the label when a scan
 * read them (ADR-0025).
 */
export function AddBottlingRow({
  brandId,
  lineName,
  suggestedName: givenName,
  readDetails: givenDetails,
}: {
  brandId: number
  lineName: string
  /**
   * A fuller name read off the label by a scan ("Mizuo 一味 Junmai"). The
   * row then says "Add this bottling" and shows the name it will start
   * from; the form opens with it, still to be checked before saving.
   */
  suggestedName?: string
  /** Grade, styles and polishing a scan read off the label. */
  readDetails?: BottlingDetails
}) {
  const t = useTranslations('bottling')
  const router = useRouter()
  // On the sake's page, a scan that led here may have read the bottling off
  // the label; without a name from the caller, start from that.
  const scanned = useSyncExternalStore(
    subscribeScannedBottling,
    () => (givenName === undefined ? getScannedBottling(brandId) : null),
    () => null,
  )
  const scannedName = givenName === undefined ? bottlingNameFromRead(lineName, scanned ?? undefined) : null
  const suggestedName = givenName ?? scannedName ?? undefined
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tSheet = useTranslations('provenance.sheet')
  const readDetails = givenDetails ?? (scanned ? detailsFromRead(scanned) : undefined)
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!open) {
    const row = (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-ash-400 px-4 py-2.5 text-left transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="add-bottling-open"
      >
        <PlusCircle size={20} className="shrink-0 text-ginshu-700" aria-hidden="true" />
        <span className="flex flex-col">
          <span className="text-card-heading font-medium text-ink">
            {suggestedName ? t('addThisBottling') : t('addRowTitle')}
          </span>
          <span className="text-meta text-ash-700" data-testid="add-bottling-hint">
            {suggestedName ?? t('addRowHint')}
          </span>
        </span>
      </button>
    )
    if (!scannedName) return row
    // The name was read off a label by the model, so it carries the badge
    // every value read by AI does — beside the row, since the badge is a
    // button of its own and cannot sit inside this one.
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3" data-testid="add-bottling-read">
          <span className="text-section-label uppercase text-ash-600">{t('readOffLabel')}</span>
          <ProvenanceBadgeView
            kind={resolveBadgeKind('llm_extracted')}
            label={tBadge('label')}
            explanation={tBadge('explanation')}
            sheetTitle={tBadge('sheetTitle')}
            closeLabel={tSheet('closeLabel')}
            id={`add-bottling-${brandId}`}
          />
        </div>
        {row}
      </div>
    )
  }

  function save(name: string, _brewery: string, details?: BottlingDetails) {
    setFailed(false)
    startTransition(async () => {
      const given = details && Object.keys(details).length > 0
      const result = await addOwnBottling({ brandId, name, ...(given ? { details } : {}) })
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      router.push({ pathname: '/bottling/[id]', params: { id: result.expressionId } })
    })
  }

  return (
    <BottlingNameForm
      initialName={suggestedName ?? lineName}
      withDetails
      initialDetails={readDetails}
      detailsFromLabel={readDetails !== undefined}
      pending={pending}
      failed={failed}
      onSubmit={save}
      onCancel={() => {
        setOpen(false)
        setFailed(false)
      }}
      testId="add-bottling"
    />
  )
}
