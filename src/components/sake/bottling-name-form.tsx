'use client'

import { type FormEvent, useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Info, Plus } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { type BottlingDetails, type Koji, KojiSchema, MAX_EXPRESSION_TEXT, MAX_STYLES } from '@/lib/schemas/expression'
import { ScanGradeSchema, ScanStyleSchema, type ScanGrade, type ScanStyle } from '@/lib/schemas/label-scan-extraction'
import { gradeLabel, styleLabel } from '@/lib/scan/read-bottling'
import { cn } from '@/lib/utils'

/** The koji's own name, after its English one in the select (design v1.9, 128). */
const KOJI_KANJI: Record<Koji, string> = { yellow: '黄麹', white: '白麹', black: '黒麹' }

/** One of these at most: how the bottle was pasteurised (or not). */
export const PASTEURISATION = ['nama', 'namachozo', 'namazume'] as const satisfies readonly ScanStyle[]
/** One of these at most: the yeast starter. */
export const STARTER = ['kimoto', 'yamahai'] as const satisfies readonly ScanStyle[]
/** Everything else, which can be combined freely. */
export const FREE_STYLES = ScanStyleSchema.options.filter(
  (s) => !(PASTEURISATION as readonly string[]).includes(s) && !(STARTER as readonly string[]).includes(s),
)

type Pasteurisation = (typeof PASTEURISATION)[number]
type Starter = (typeof STARTER)[number]

/**
 * Stored style words, sorted back into the form's parts: the pasteurisation
 * and the starter (one each), the free styles, and the rest for "Other".
 * Matched without case, so "nama" written by hand selects Nama. A second
 * pasteurisation or starter word (which the old free-text field allowed) goes
 * to "Other" rather than being lost.
 */
export function splitStyles(words: readonly string[]): {
  pasteurisation: Pasteurisation | ''
  starter: Starter | ''
  free: ScanStyle[]
  other: string[]
} {
  let pasteurisation: Pasteurisation | '' = ''
  let starter: Starter | '' = ''
  const free: ScanStyle[] = []
  const other: string[] = []
  for (const word of words) {
    const style = ScanStyleSchema.options.find(
      (s) => s === word.toLowerCase() || styleLabel(s).toLowerCase() === word.toLowerCase(),
    )
    if (!style) other.push(word)
    else if ((PASTEURISATION as readonly string[]).includes(style)) {
      if (pasteurisation === '') pasteurisation = style as Pasteurisation
      else if (style !== pasteurisation) other.push(word)
    } else if ((STARTER as readonly string[]).includes(style)) {
      if (starter === '') starter = style as Starter
      else if (style !== starter) other.push(word)
    } else if (!free.includes(style)) free.push(style)
  }
  return { pasteurisation, starter, free, other }
}

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
 * `withDetails` adds Grade, Polishing, Koji and Style (design v1.7 D5,
 * screenshot 84), all optional; `initialDetails` fills them from a scan's read
 * or from what is stored. The style words a label prints (the list the scan
 * reads) are split by what can go together: Pasteurisation (Nama /
 * Namachozō / Namazume) and Starter (Kimoto / Yamahai) are one choice each,
 * the rest (Genshu, Muroka, Nigori …) boxes to tick, plus "Other" for
 * anything else — all stored together as the bottling's style words.
 * Koji is ahead of the design (question V).
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
  const kojiId = useId()
  const pasteurisationId = useId()
  const starterId = useId()
  const [name, setName] = useState(initialName)
  const [brewery, setBrewery] = useState(initialBrewery)
  const [grade, setGrade] = useState<ScanGrade | ''>(initialDetails?.grade ?? '')
  const [polishing, setPolishing] = useState(initialDetails?.polishingPct ? String(initialDetails.polishingPct) : '')
  const initialStyles = splitStyles(initialDetails?.styles ?? [])
  const [pasteurisation, setPasteurisation] = useState<Pasteurisation | ''>(initialStyles.pasteurisation)
  const [starter, setStarter] = useState<Starter | ''>(initialStyles.starter)
  const [checked, setChecked] = useState<ScanStyle[]>(initialStyles.free)
  const [otherStyles, setOtherStyles] = useState(initialStyles.other.join(', '))
  const [koji, setKoji] = useState<Koji | ''>(initialDetails?.koji ?? '')
  const [more, setMore] = useState(
    Boolean(initialStyles.starter || initialDetails?.koji || initialStyles.other.length > 0),
  )
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
    const words = [
      ...(pasteurisation ? [styleLabel(pasteurisation)] : []),
      ...(starter ? [styleLabel(starter)] : []),
      ...FREE_STYLES.filter((s) => checked.includes(s)).map(styleLabel),
      ...otherStyles.split(/[,、]/).map((s) => s.trim()).filter(Boolean),
    ].slice(0, MAX_STYLES)
    // Only what is filled in: an empty form sends `{}`, which on a rename
    // clears what was stored.
    onSubmit(trimmed, brewery.trim(), {
      ...(grade ? { grade } : {}),
      ...(words.length > 0 ? { styles: words } : {}),
      ...(pct >= 1 && pct <= 100 ? { polishingPct: pct } : {}),
      ...(koji ? { koji } : {}),
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
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex items-center gap-1.5">
              <label htmlFor={pasteurisationId} className="text-section-label uppercase text-ash-600">
                {t('pasteurisationLabel')}
              </label>
              {/* V3: ⓘ opens Learn's nama entry, in a new tab so the form keeps what was typed. */}
              <Link
                href={{ pathname: '/learn/[slug]', params: { slug: 'nama' } }}
                target="_blank"
                rel="noopener"
                aria-label={t('pasteurisationInfo')}
                className="inline-flex size-5 items-center justify-center rounded-full text-ash-600 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid={`${testId}-pasteurisation-info`}
              >
                <Info size={15} aria-hidden="true" />
              </Link>
            </span>
            <select
              id={pasteurisationId}
              value={pasteurisation}
              onChange={(event) => setPasteurisation(event.target.value as Pasteurisation | '')}
              className={field}
              data-testid={`${testId}-pasteurisation`}
            >
              <option value="">{t('pasteurisationUsual')}</option>
              {PASTEURISATION.map((s) => (
                <option key={s} value={s}>
                  {t(`pasteurisation.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-section-label uppercase text-ash-600">{t('styleTickAny')}</legend>
            <div className="flex flex-wrap gap-2" data-testid={`${testId}-style-options`}>
              {FREE_STYLES.map((style) => {
                const on = checked.includes(style)
                return (
                  <label key={style} className="cursor-pointer">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => setChecked((current) => (on ? current.filter((s) => s !== style) : [...current, style]))}
                      className="peer sr-only"
                      data-testid={`${testId}-style-${style}`}
                    />
                    <span
                      className={cn(
                        'flex min-h-9 items-center rounded-full border px-3 text-meta transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ginshu-600',
                        on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-800' : 'border-ash-300 text-ink hover:bg-ash-100',
                      )}
                    >
                      {styleLabel(style)}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          {/* V1: starter, koji and other style words behind one link, open
              by itself when a read (or the bottling being renamed) has any. */}
          {!more ? (
            <button
              type="button"
              onClick={() => setMore(true)}
              aria-expanded={false}
              className="flex min-h-10 w-fit items-center gap-1.5 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid={`${testId}-more`}
            >
              <Plus size={15} aria-hidden="true" />
              {t('moreDetails')}
            </button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor={starterId} className="text-section-label uppercase text-ash-600">
                    {t('starterLabel')}
                  </label>
                  <select
                    id={starterId}
                    value={starter}
                    onChange={(event) => setStarter(event.target.value as Starter | '')}
                    className={field}
                    data-testid={`${testId}-starter`}
                  >
                    <option value="">{t('notGiven')}</option>
                    {STARTER.map((s) => (
                      <option key={s} value={s}>
                        {styleLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor={kojiId} className="text-section-label uppercase text-ash-600">
                    {t('kojiLabel')}
                  </label>
                  <select
                    id={kojiId}
                    value={koji}
                    onChange={(event) => setKoji(event.target.value as Koji | '')}
                    className={field}
                    data-testid={`${testId}-koji`}
                  >
                    <option value="">{t('notGiven')}</option>
                    {KojiSchema.options.map((k) => (
                      <option key={k} value={k}>
                        {t(`koji.${k}`)} {KOJI_KANJI[k]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={styleId} className="text-section-label uppercase text-ash-600">
                  {t('styleOtherLabel')}
                </label>
                <input
                  id={styleId}
                  value={otherStyles}
                  onChange={(event) => setOtherStyles(event.target.value)}
                  placeholder={t('styleOtherPlaceholder')}
                  autoComplete="off"
                  className={field}
                  data-testid={`${testId}-styles`}
                />
              </div>
            </>
          )}
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
