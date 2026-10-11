'use client'

import { type FormEvent, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'

/**
 * The form a bottling of your own is named in (design v1.6, screenshot 55): a
 * name field prefilled with the best guess — the sake's name, or what was
 * typed into search — "Add bottling" and "Cancel". Shared by "Add your
 * bottling" on a sake's page and "Add it yourself" in search, so the name is
 * always confirmed, and can be corrected, before anything is saved.
 *
 * `withBrewery` adds an optional second field, for a bottle whose sake the
 * catalogue lacks: with no sake there is no brewery to take from the
 * catalogue, and the one on the label is worth keeping.
 *
 * The caller owns the saving (`onSubmit`) and says how it is going (`pending`,
 * `failed`); the form owns the two fields.
 */
export function BottlingNameForm({
  initialName,
  withBrewery = false,
  pending,
  failed,
  onSubmit,
  onCancel,
  testId,
}: {
  initialName: string
  withBrewery?: boolean
  pending: boolean
  failed: boolean
  onSubmit: (name: string, brewery: string) => void
  onCancel: () => void
  /** Prefix for the form's test ids. */
  testId: string
}) {
  const t = useTranslations('bottling')
  const nameId = useId()
  const breweryId = useId()
  const [name, setName] = useState(initialName)
  const [brewery, setBrewery] = useState('')
  const trimmed = name.trim()
  const field =
    'min-h-11 rounded-lg border border-ash-300 bg-ground px-3 text-card-heading text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (trimmed.length === 0 || pending) return
    onSubmit(trimmed, brewery.trim())
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-dashed border-ash-400 p-3.5"
      data-testid={`${testId}-form`}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-section-label uppercase text-ash-600">
          {t('nameLabel')}
        </label>
        <input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_EXPRESSION_TEXT}
          autoFocus
          autoComplete="off"
          // The caret lands at the end of the prefilled name, ready to add to
          // it or to fix its last letters.
          onFocus={(event) => event.target.setSelectionRange(name.length, name.length)}
          className={field}
          data-testid={`${testId}-name`}
        />
      </div>
      {withBrewery && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={breweryId} className="text-section-label uppercase text-ash-600">
            {t('breweryLabel')}
          </label>
          <input
            id={breweryId}
            value={brewery}
            onChange={(event) => setBrewery(event.target.value)}
            maxLength={MAX_EXPRESSION_TEXT}
            autoComplete="off"
            className={field}
            data-testid={`${testId}-brewery`}
          />
        </div>
      )}
      <p className="text-meta text-ash-700">{t(withBrewery ? 'formHintUnlisted' : 'formHint')}</p>
      {failed && (
        <p className="text-meta text-ginshu-700" role="alert" data-testid={`${testId}-error`}>
          {t('error')}
        </p>
      )}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={trimmed.length === 0 || pending}
          aria-busy={pending}
          className="flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
          data-testid={`${testId}-submit`}
        >
          {pending ? t('adding') : t('add')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-md px-1 text-body text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid={`${testId}-cancel`}
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
