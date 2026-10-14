'use client'

import { type FormEvent, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type BottlingDetails, MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'
import { ScanGradeSchema, type ScanGrade } from '@/lib/schemas/label-scan-extraction'
import { gradeLabel } from '@/lib/scan/read-bottling'

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
 * The same form renames a bottling (`mode="rename"`): the fields start from
 * what is stored and the button says "Save".
 *
 * `withDetails` adds Grade, Polishing and Style (design v1.7 D5, screenshot
 * 84), all optional; `initialDetails` fills them from a scan's read or from
 * what is stored.
 *
 * The caller owns the saving (`onSubmit`) and says how it is going (`pending`,
 * `failed`); the form owns the fields.
 */
export function BottlingNameForm({
  initialName,
  initialBrewery = '',
  withBrewery = false,
  withDetails = false,
  initialDetails,
  detailsFromLabel = false,
  mode = 'add',
  pending,
  failed,
  onSubmit,
  onCancel,
  testId,
}: {
  initialName: string
  initialBrewery?: string
  withBrewery?: boolean
  withDetails?: boolean
  initialDetails?: BottlingDetails
  /** The details were read off a label: the hint asks to check them. */
  detailsFromLabel?: boolean
  /** `add` names a new bottling; `rename` edits one that exists (§9a, v1.6.2). */
  mode?: 'add' | 'rename'
  pending: boolean
  failed: boolean
  onSubmit: (name: string, brewery: string, details?: BottlingDetails) => void
  onCancel: () => void
  /** Prefix for the form's test ids. */
  testId: string
}) {
  const t = useTranslations('bottling')
  const nameId = useId()
  const breweryId = useId()
  const gradeId = useId()
  const polishingId = useId()
  const styleId = useId()
  const [name, setName] = useState(initialName)
  const [brewery, setBrewery] = useState(initialBrewery)
  const [grade, setGrade] = useState<ScanGrade | ''>(initialDetails?.grade ?? '')
  const [polishing, setPolishing] = useState(initialDetails?.polishingPct ? String(initialDetails.polishingPct) : '')
  const [styles, setStyles] = useState((initialDetails?.styles ?? []).join(', '))
  const trimmed = name.trim()
  const field =
    'min-h-11 rounded-lg border border-ash-300 bg-ground px-3 text-card-heading text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (trimmed.length === 0 || pending) return
    if (!withDetails) {
      onSubmit(trimmed, brewery.trim())
      return
    }
    const pct = Number.parseInt(polishing, 10)
    const words = styles.split(/[,、]/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
    // Only what is filled in: an empty form sends `{}`, which on a rename
    // clears what was stored.
    onSubmit(trimmed, brewery.trim(), {
      ...(grade ? { grade } : {}),
      ...(words.length > 0 ? { styles: words } : {}),
      ...(pct >= 1 && pct <= 100 ? { polishingPct: pct } : {}),
    })
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
      {withDetails && (
        <>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={gradeId} className="text-section-label uppercase text-ash-600">
                {t('gradeLabel')}
              </label>
              <select
                id={gradeId}
                value={grade}
                onChange={(event) => setGrade(event.target.value as ScanGrade | '')}
                className={field}
                data-testid={`${testId}-grade`}
              >
                <option value="">{t('gradeNone')}</option>
                {ScanGradeSchema.options.map((g) => (
                  <option key={g} value={g}>
                    {gradeLabel(g)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={polishingId} className="text-section-label uppercase text-ash-600">
                {t('polishingLabel')}
              </label>
              <div className="relative">
                <input
                  id={polishingId}
                  value={polishing}
                  onChange={(event) => setPolishing(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${field} w-full pr-8`}
                  data-testid={`${testId}-polishing`}
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-card-heading text-ash-600" aria-hidden="true">
                  %
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={styleId} className="text-section-label uppercase text-ash-600">
              {t('styleLabel')}
            </label>
            <input
              id={styleId}
              value={styles}
              onChange={(event) => setStyles(event.target.value)}
              autoComplete="off"
              className={field}
              data-testid={`${testId}-styles`}
            />
          </div>
        </>
      )}
      {mode === 'add' && (
        <p className="text-meta text-ash-700">
          {t(
            withDetails
              ? detailsFromLabel
                ? 'formHintFromLabel'
                : 'formHintDetails'
              : withBrewery
                ? 'formHintUnlisted'
                : 'formHint',
          )}
        </p>
      )}
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
          {mode === 'rename' ? (pending ? t('saving') : t('save')) : pending ? t('adding') : t('add')}
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
