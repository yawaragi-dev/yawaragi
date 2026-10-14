'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from '@/i18n/navigation'
import { BottlingNameForm } from '@/components/sake/bottling-name-form'
import { addOwnBottling } from '@/lib/collection/expression-actions'
import type { BottlingDetails } from '@/lib/schemas/expression'

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
  suggestedName,
  readDetails,
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
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
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
