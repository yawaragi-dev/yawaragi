'use client'

import { type FormEvent, useId, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from '@/i18n/navigation'
import { addOwnBottling } from '@/lib/collection/expression-actions'
import { MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'

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
  const fieldId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(lineName)
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

  const trimmed = name.trim()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (trimmed.length === 0 || pending) return
    setFailed(false)
    startTransition(async () => {
      const result = await addOwnBottling({ brandId, name: trimmed })
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      router.push({ pathname: '/bottling/[id]', params: { id: result.expressionId } })
    })
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-ash-400 p-3.5"
      data-testid="add-bottling-form"
    >
      <label htmlFor={fieldId} className="text-section-label uppercase text-ash-600">
        {t('nameLabel')}
      </label>
      <input
        id={fieldId}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={MAX_EXPRESSION_TEXT}
        autoFocus
        autoComplete="off"
        // The page behind it is dark and this is its one field, so the caret
        // lands at the end of the prefilled name, ready to add to it.
        onFocus={(event) => event.target.setSelectionRange(name.length, name.length)}
        className="min-h-11 rounded-lg border border-ash-300 bg-ground px-3 text-card-heading text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="add-bottling-name"
      />
      <p className="text-meta text-ash-700">{t('formHint')}</p>
      {failed && (
        <p className="text-meta text-ginshu-700" role="alert" data-testid="add-bottling-error">
          {t('error')}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={trimmed.length === 0 || pending}
          aria-busy={pending}
          className="flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
          data-testid="add-bottling-submit"
        >
          {pending ? t('adding') : t('add')}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            setName(lineName)
            setFailed(false)
          }}
          className="min-h-11 rounded-md px-1 text-body text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="add-bottling-cancel"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
