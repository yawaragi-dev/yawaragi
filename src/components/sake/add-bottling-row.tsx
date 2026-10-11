'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from '@/i18n/navigation'
import { BottlingNameForm } from '@/components/sake/bottling-name-form'
import { addOwnBottling } from '@/lib/collection/expression-actions'

/**
 * §9's dashed "Add your bottling" row (design v1.6.1, screenshots 63 and 55):
 * one tap opens the form in place — a name field prefilled with the sake's
 * name, a line saying who can see it, "Add bottling" and "Cancel". Saving
 * opens the new bottling's own page (§9a).
 *
 * "Just the name — the rest can wait": nothing else is asked, and nothing
 * else is stored (ADR-0025).
 */
export function AddBottlingRow({ brandId, lineName }: { brandId: number; lineName: string }) {
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
          <span className="text-card-heading font-medium text-ink">{t('addRowTitle')}</span>
          <span className="text-meta text-ash-700">{t('addRowHint')}</span>
        </span>
      </button>
    )
  }

  function save(name: string) {
    setFailed(false)
    startTransition(async () => {
      const result = await addOwnBottling({ brandId, name })
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      router.push({ pathname: '/bottling/[id]', params: { id: result.expressionId } })
    })
  }

  return (
    <BottlingNameForm
      initialName={lineName}
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
