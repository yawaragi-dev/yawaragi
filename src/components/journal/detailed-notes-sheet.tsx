'use client'

import { type ReactNode, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarBlank,
  CaretDown,
  CaretUp,
  CheckCircle,
  Drop,
  Eye,
  ThermometerSimple,
  Wind,
} from '@phosphor-icons/react/dist/ssr'
import { InfoSheet } from '@/components/ui/info-sheet'
import { LearnMoreLink } from '@/components/learn/learn-more-link'
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/components/ui/sheet'
import {
  AROMAS,
  CLARITY,
  COLOR,
  DETAILED_NOTES_PARTS,
  DRINK_AGAIN,
  type DetailedNotes,
  type DetailedNotesPart,
  NOSE_INTENSITY,
  OCCASIONS,
  PALATE_SCALES,
  SERVING_TEMPERATURES,
  SERVING_TEMPERATURE_TERMS,
  VESSELS,
  isPartFilled,
} from '@/lib/schemas/detailed-notes'
import { EARLIEST_TASTING_DAY, type TastingPatch } from '@/lib/schemas/tasting-input'
import * as saves from '@/lib/taste/tasting-actions'
import { browserIsOnline, reachable } from '@/lib/network/settle-request'
import { europeanDay } from '@/lib/taste/tasting-day'
import { cn } from '@/lib/utils'

// Saves that the network loses answer "unavailable" (Couldn't save) instead
// of throwing to the error page (design question S6).
const updateTasting = reachable(saves.updateTasting)

/** What the sheet saves: the whole sheet, and the day. */
type SheetPatch = Pick<TastingPatch, 'detail' | 'triedOn'>

/**
 * §10 Detailed notes — the bottom sheet. Reference screenshot 11.
 *
 * "Look, smell, taste, decide": five collapsible parts, the first open by
 * default (§10 says Palate), every field optional, **no Save button** — every pick saves as it
 * is made (rule 1's spirit, and §10's own "it saves as you go"). A pick sends
 * the whole sheet, so the server never has to merge partial sheets; the free
 * text field waits for a pause in typing.
 *
 * Every value is a stable key (`slightlyHazy`, a 1–5 step), never the word on
 * the button — the schema's rule, so the copy can change without a migration.
 * The subtitle counts filled parts the same way the schema does.
 *
 * Not here: §10's "About the sake" part. It is for the user's own,
 * non-catalogue entries, and manual entry is not built. For catalogue sakes
 * §10 points at the bottle page's spec grid instead, which is not built either
 * (#339), so that line is left out rather than pointing at nothing.
 */

const SAVE_TEXT_DEBOUNCE_MS = 700

const PART_ICONS = {
  appearance: Eye,
  nose: Wind,
  palate: Drop,
  serve: ThermometerSimple,
  verdict: CheckCircle,
} as const

export function DetailedNotesSheet({
  entryId,
  initial,
  initialDay,
  open,
  onOpenChange,
  onSaved,
}: {
  entryId: string
  initial: DetailedNotes | undefined
  /** The tasting's day, `YYYY-MM-DD`. */
  initialDay: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the sheet after each successful save. */
  onSaved?: (notes: DetailedNotes) => void
}) {
  const t = useTranslations('detailedNotes')
  const [notes, setNotes] = useState<DetailedNotes>(initial ?? {})
  // The first part, so the sheet reads top-down in "look, smell, taste,
  // decide" order. §10 opens Palate; the maintainer preferred the first.
  const [openPart, setOpenPart] = useState<DetailedNotesPart | null>(DETAILED_NOTES_PARTS[0])
  const [failed, setFailed] = useState(false)
  /**
   * Design v1.9 S6 (written): saves the network lost. The fields keep what
   * was picked or typed, a line under the title says it is not in the journal
   * yet, Done becomes Try again, and closing asks first. `tries` counts the
   * sends that found no connection ("Still no connection" from the second).
   */
  const [lost, setLost] = useState<{ tries: number } | null>(null)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  const [isPending, startTransition] = useTransition()
  const textTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** What the network lost so far, sent again with the next save. */
  const unsent = useRef<SheetPatch | null>(null)
  /** The sheet as the server last kept it — what "Leave" goes back to. */
  const saved = useRef({ notes: initial ?? {}, day: initialDay })
  const [day, setDay] = useState(initialDay)
  // The visitor's own calendar: a tasting can be today, never tomorrow. Read
  // once, when the sheet first renders (only ever in the browser, after a tap).
  const [today] = useState(() => new Date().toLocaleDateString('en-CA'))

  useEffect(() => () => clearTimeout(textTimer.current), [])

  /** Send a change, together with anything still waiting from a lost save. */
  function send(patch: SheetPatch) {
    const full: SheetPatch = { ...unsent.current, ...patch }
    if (full.detail === undefined && full.triedOn === undefined) return
    startTransition(async () => {
      const result = await updateTasting(entryId, full)
      if (result.status === 'ok') {
        saved.current = { notes: full.detail ?? saved.current.notes, day: full.triedOn ?? saved.current.day }
        // Drop only what this send carried: a later lost save stays waiting.
        const left = { ...unsent.current }
        if (left.detail === full.detail) delete left.detail
        if (left.triedOn === full.triedOn) delete left.triedOn
        unsent.current = left.detail === undefined && left.triedOn === undefined ? null : left
        setFailed(false)
        if (!unsent.current) setLost(null)
        onSaved?.(saved.current.notes)
        return
      }
      if (result.status === 'unavailable' && !browserIsOnline()) {
        unsent.current = { ...unsent.current, ...full }
        setFailed(false)
        setLost((was) => ({ tries: (was?.tries ?? 0) + 1 }))
        return
      }
      setFailed(true)
    })
  }

  function save(next: DetailedNotes) {
    send({ detail: next })
  }

  /** Move the tasting to another day. A cleared or half-typed field is
   *  not a day, so it saves nothing. */
  function changeDay(value: string) {
    setDay(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today || value < EARLIEST_TASTING_DAY) return
    send({ triedOn: value })
  }

  /** Try again: send what is waiting, including text still in its pause. */
  function retry() {
    const typing = textTimer.current !== undefined
    clearTimeout(textTimer.current)
    textTimer.current = undefined
    send(typing ? { detail: notes } : {})
  }

  /** Closing with unsaved notes asks first; anything else closes as before. */
  function requestOpenChange(next: boolean) {
    if (!next && lost) {
      setConfirmingLeave(true)
      return
    }
    onOpenChange(next)
  }

  /** "Leave": what was not saved is dropped, and the sheet reopens as kept. */
  function leave() {
    clearTimeout(textTimer.current)
    textTimer.current = undefined
    unsent.current = null
    setLost(null)
    setConfirmingLeave(false)
    setNotes(saved.current.notes)
    setDay(saved.current.day)
    onOpenChange(false)
  }

  /** Apply a change to one part and save straight away. */
  function setPart<P extends DetailedNotesPart>(part: P, value: NonNullable<DetailedNotes[P]>) {
    const next = { ...notes, [part]: { ...notes[part], ...value } }
    setNotes(next)
    clearTimeout(textTimer.current)
    save(next)
  }

  function setWith(text: string) {
    const next = { ...notes, serve: { ...notes.serve, with: text } }
    setNotes(next)
    clearTimeout(textTimer.current)
    textTimer.current = setTimeout(() => {
      textTimer.current = undefined
      save(next)
    }, SAVE_TEXT_DEBOUNCE_MS)
  }

  /** One-of: tapping the current choice clears it. */
  const pickOne = <T extends string>(current: T | undefined, value: T): T | undefined =>
    current === value ? undefined : value
  /** Pick-any: toggles membership. */
  const toggle = <T extends string>(list: readonly T[] | undefined, value: T): T[] => {
    const cur = list ?? []
    return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
  }

  const filled = DETAILED_NOTES_PARTS.filter((p) => isPartFilled(notes, p)).length
  const total = DETAILED_NOTES_PARTS.length

  const summary = (part: DetailedNotesPart): string | null => {
    if (!isPartFilled(notes, part)) return null
    const v = t.raw('values') as Record<string, Record<string, string>>
    switch (part) {
      case 'appearance':
        return [notes.appearance?.clarity && v.clarity![notes.appearance.clarity], notes.appearance?.color && v.color![notes.appearance.color]]
          .filter(Boolean)
          .join(' · ')
      case 'nose':
        return [
          notes.nose?.intensity && v.intensity![notes.nose.intensity],
          (notes.nose?.aromas ?? []).map((a) => v.aromas![a]).join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
      case 'palate':
        return PALATE_SCALES.filter((s) => notes.palate?.[s])
          .map((s) => t(`scales.${s}.steps.s${notes.palate![s]}`))
          .join(' · ')
      case 'serve':
        return [
          notes.serve?.temperature && temperatureName(notes.serve.temperature),
          notes.serve?.vessel && v.vessel![notes.serve.vessel],
          notes.serve?.with?.trim(),
        ]
          .filter(Boolean)
          .join(' · ')
      case 'verdict':
        return [
          notes.verdict?.again && v.again![notes.verdict.again],
          (notes.verdict?.suits ?? []).map((s) => v.suits![s]).join(', '),
        ]
          .filter(Boolean)
          .join(' · ')
    }
  }

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        overlayClassName="bg-black/55 supports-backdrop-filter:backdrop-blur-none"
        className="max-h-[90dvh] gap-0 rounded-t-[20px] border-0 bg-surface p-0 text-ink shadow-yw-lg"
        data-testid="detailed-notes-sheet"
      >
        <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
          <span className="h-1 w-9 rounded-full bg-ash-400" />
        </div>
        <div className="flex items-center gap-2.5 px-5 pt-1.5 pb-2.5">
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-title font-medium text-ink">{t('title')}</SheetTitle>
            <p className="mt-0.5 text-meta text-ash-600" data-testid="detailed-notes-progress">
              {filled > 0 ? t('partsFilled', { n: filled, total }) : t('allOptional')}
            </p>
          </div>
          {lost ? (
            <button
              type="button"
              onClick={retry}
              disabled={isPending}
              className="min-h-10 rounded-xl border border-ash-300 px-[18px] text-body font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
              data-testid="detailed-notes-try-again"
            >
              {t('tryAgain')}
            </button>
          ) : (
            <SheetClose
              render={
                <button
                  type="button"
                  className="min-h-10 rounded-xl border border-ginshu-400 px-[18px] text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid="detailed-notes-done"
                />
              }
            >
              {t('done')}
            </SheetClose>
          )}
        </div>

        {/* Design v1.9 S6: the rating panel's line, under the sheet title. */}
        {lost && !confirmingLeave && (
          <p role="alert" className="px-5 pb-2.5 text-meta text-ash-700" data-testid="detailed-notes-not-saved">
            {lost.tries > 1 ? t('stillNoConnection') : t('noConnection')}
          </p>
        )}
        {confirmingLeave && (
          // Asked in the sheet, in the delete question's ground-coloured box.
          <div
            className="mx-5 mb-2.5 flex flex-col gap-2 rounded-md bg-ground p-3"
            role="alertdialog"
            aria-label={t('leaveConfirm')}
            data-testid="detailed-notes-leave-confirm"
          >
            <span className="text-meta text-ink">{t('leaveConfirm')}</span>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingLeave(false)}
                className="min-h-9 rounded-md px-3 text-meta text-ash-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="detailed-notes-stay"
              >
                {t('stay')}
              </button>
              <button
                type="button"
                onClick={leave}
                className="min-h-9 rounded-md border border-ginshu-700 bg-ginshu-100 px-3 text-meta font-medium text-ginshu-700 transition-colors hover:bg-ginshu-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="detailed-notes-leave"
              >
                {t('leave')}
              </button>
            </div>
          </div>
        )}

        {/* Rule 7: the list fades under the fixed header instead of a hard
            border, with 16px of padding so nothing fades at rest. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-6 [mask-image:linear-gradient(to_bottom,transparent_0,#000_18px)]">
          <p className="pt-1 pb-2 text-meta leading-normal text-ash-700">{t('intro')}</p>
          {/* Not in §10: the day of the tasting, so one logged late can say
              when it really happened. At the top rather than inside "How you
              had it", which starts collapsed. Asked on #308. */}
          <div className="flex items-center justify-between gap-3 border-b border-divider pb-3">
            <label htmlFor={`tried-on-${entryId}`} className="text-section-label uppercase text-ash-600">
              {t('triedOn')}
            </label>
            {/* A native date input draws the day in the browser's own format
                (US-style for an English browser), which no attribute can
                change. So the day is shown European-style, day first, and the
                input lies transparent on top of it: tapping still opens the
                system picker, and assistive tech still gets a real date field.
                Following the visitor's own locale instead is #371. */}
            <span className="relative inline-flex min-h-11 items-center rounded-md border border-divider bg-ground px-3 text-body text-ink focus-within:ring-2 focus-within:ring-ginshu-600">
              <span aria-hidden="true" data-testid="detailed-notes-tried-on-shown">
                {europeanDay(day)}
              </span>
              <CalendarBlank size={16} aria-hidden="true" className="ml-2 text-ash-600" />
              <input
                type="date"
                value={day}
                min={EARLIEST_TASTING_DAY}
                max={today}
                onChange={(e) => changeDay(e.target.value)}
                onClick={(e) => e.currentTarget.showPicker?.()}
                className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]"
                id={`tried-on-${entryId}`}
                data-testid="detailed-notes-tried-on"
              />
            </span>
          </div>

          {failed && (
            <p role="alert" className="pb-2 text-meta text-ginshu-700" data-testid="detailed-notes-error">
              {t('error')}
            </p>
          )}

          {DETAILED_NOTES_PARTS.map((part) => {
            const Icon = PART_ICONS[part]
            const isOpen = openPart === part
            const sum = summary(part)
            const panelId = `detailed-notes-${part}`
            return (
              <div key={part} className="border-b border-divider" data-testid={`detailed-notes-part-${part}`}>
                <button
                  type="button"
                  onClick={() => setOpenPart(isOpen ? null : part)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid={`detailed-notes-toggle-${part}`}
                >
                  <Icon size={19} aria-hidden="true" className={sum ? 'text-ginshu-600' : 'text-ash-500'} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-card-heading font-medium text-ink">{t(`parts.${part}.title`)}</span>
                    <span className="mt-px text-meta text-ash-600" data-testid={`detailed-notes-summary-${part}`}>
                      {sum ?? t(`parts.${part}.hint`)}
                    </span>
                  </span>
                  {isOpen ? (
                    <CaretUp size={15} aria-hidden="true" className="text-ash-500" />
                  ) : (
                    <CaretDown size={15} aria-hidden="true" className="text-ash-500" />
                  )}
                </button>

                {isOpen && (
                  <div id={panelId} className="flex flex-col gap-3 pb-4 pl-[30px] motion-safe:animate-yw-fade">
                    {part === 'appearance' && (
                      <>
                        <ChipGroup
                          label={t('fields.clarity')}
                          options={CLARITY}
                          labelOf={(k) => t(`values.clarity.${k}`)}
                          isOn={(k) => notes.appearance?.clarity === k}
                          onPick={(k) => setPart('appearance', { clarity: pickOne(notes.appearance?.clarity, k) })}
                          testId="clarity"
                        />
                        <ChipGroup
                          label={t('fields.color')}
                          options={COLOR}
                          labelOf={(k) => t(`values.color.${k}`)}
                          isOn={(k) => notes.appearance?.color === k}
                          onPick={(k) => setPart('appearance', { color: pickOne(notes.appearance?.color, k) })}
                          testId="color"
                        />
                      </>
                    )}
                    {part === 'nose' && (
                      <>
                        <ChipGroup
                          label={t('fields.intensity')}
                          options={NOSE_INTENSITY}
                          labelOf={(k) => t(`values.intensity.${k}`)}
                          isOn={(k) => notes.nose?.intensity === k}
                          onPick={(k) => setPart('nose', { intensity: pickOne(notes.nose?.intensity, k) })}
                          testId="intensity"
                        />
                        <ChipGroup
                          label={t('fields.aromas')}
                          options={AROMAS}
                          labelOf={(k) => t(`values.aromas.${k}`)}
                          isOn={(k) => (notes.nose?.aromas ?? []).includes(k)}
                          onPick={(k) => setPart('nose', { aromas: toggle(notes.nose?.aromas, k) })}
                          testId="aromas"
                        />
                      </>
                    )}
                    {part === 'palate' &&
                      PALATE_SCALES.map((scale) => {
                        const value = notes.palate?.[scale]
                        const label = t(`scales.${scale}.label`)
                        return (
                          <div key={scale} className="flex flex-col gap-1.5" role="group" aria-label={label}>
                            <div className="flex justify-between text-meta">
                              <span className="text-ink">{label}</span>
                              <span className="text-ash-600" data-testid={`detailed-notes-scale-${scale}-value`}>
                                {value ? t(`scales.${scale}.steps.s${value}`) : t('notSet')}
                              </span>
                            </div>
                            <div className="grid grid-cols-5 gap-1">
                              {[1, 2, 3, 4, 5].map((step) => (
                                <button
                                  key={step}
                                  type="button"
                                  // §10: "tapping the current step clears it".
                                  onClick={() =>
                                    setPart('palate', { [scale]: value === step ? undefined : step })
                                  }
                                  aria-label={t('stepLabel', {
                                    scale: label,
                                    step: t(`scales.${scale}.steps.s${step}`),
                                  })}
                                  aria-pressed={value === step}
                                  className="flex h-[30px] items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                                  data-testid={`detailed-notes-scale-${scale}-${step}`}
                                >
                                  <span
                                    className={cn(
                                      'block h-2 w-full rounded',
                                      value && step <= value ? 'bg-ginshu-500' : 'bg-ash-300',
                                    )}
                                  />
                                </button>
                              ))}
                            </div>
                            <div className="flex justify-between text-micro text-ash-600">
                              <span>{t(`scales.${scale}.steps.s1`)}</span>
                              <span>{t(`scales.${scale}.steps.s5`)}</span>
                            </div>
                          </div>
                        )
                      })}
                    {part === 'serve' && (
                      <>
                        <ChipGroup
                          label={t('fields.temperature')}
                          options={SERVING_TEMPERATURES}
                          // Romaji and degrees; the kanji are in the info sheet
                          // beside the field, as the flavor chart keeps its
                          // Japanese terms in its own.
                          labelOf={temperatureName}
                          isOn={(k) => notes.serve?.temperature === k}
                          onPick={(k) => setPart('serve', { temperature: pickOne(notes.serve?.temperature, k) })}
                          testId="temperature"
                          aside={
                            // §16's pattern, as beside the flavor chart: the
                            // names are brewers' terms, so they get the same
                            // "what do these mean" sheet — kanji included.
                            <InfoSheet
                              id="serving-temperatures"
                              caveat={t('temperatureTerms.caveat')}
                              triggerLabel={t('temperatureTerms.triggerLabel')}
                              title={t('temperatureTerms.title')}
                              closeLabel={t('temperatureTerms.closeLabel')}
                            >
                              <p className="mb-4">{t('temperatureTerms.intro')}</p>
                              <dl className="flex flex-col gap-3" data-testid="serving-temperature-terms">
                                {SERVING_TEMPERATURES.map((k) => (
                                  <div key={k} className="flex gap-3">
                                    <dt className="w-[42px] shrink-0 text-subtle font-medium text-ink">
                                      {SERVING_TEMPERATURE_TERMS[k].degrees}°
                                    </dt>
                                    <dd className="min-w-0 flex-1">
                                      <span className="text-subtle text-ink" lang="ja">
                                        {SERVING_TEMPERATURE_TERMS[k].kanji}
                                      </span>{' '}
                                      <span className="text-meta text-ash-600">{SERVING_TEMPERATURE_TERMS[k].romaji}</span>
                                      <span className="mt-0.5 block text-meta leading-snug text-ash-700">
                                        {t(`temperatureTerms.notes.${k}`)}
                                      </span>
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                              <LearnMoreLink
                                slug="serving-temperatures"
                                label={t('temperatureTerms.learnMore')}
                              />
                            </InfoSheet>
                          }
                        />
                        <ChipGroup
                          label={t('fields.vessel')}
                          options={VESSELS}
                          labelOf={(k) => t(`values.vessel.${k}`)}
                          isOn={(k) => notes.serve?.vessel === k}
                          onPick={(k) => setPart('serve', { vessel: pickOne(notes.serve?.vessel, k) })}
                          testId="vessel"
                        />
                        <label className="flex flex-col gap-1.5">
                          <span className="text-section-label uppercase text-ash-600">{t('fields.with')}</span>
                          <input
                            type="text"
                            maxLength={200}
                            value={notes.serve?.with ?? ''}
                            onChange={(e) => setWith(e.target.value)}
                            placeholder={t('fields.withPlaceholder')}
                            className="min-h-11 rounded-md border border-divider bg-ground px-3 text-body text-ink placeholder:italic placeholder:text-ash-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                            data-testid="detailed-notes-with"
                          />
                        </label>
                      </>
                    )}
                    {part === 'verdict' && (
                      <>
                        <ChipGroup
                          label={t('fields.again')}
                          options={DRINK_AGAIN}
                          labelOf={(k) => t(`values.again.${k}`)}
                          isOn={(k) => notes.verdict?.again === k}
                          onPick={(k) => setPart('verdict', { again: pickOne(notes.verdict?.again, k) })}
                          testId="again"
                        />
                        <ChipGroup
                          label={t('fields.suits')}
                          options={OCCASIONS}
                          labelOf={(k) => t(`values.suits.${k}`)}
                          isOn={(k) => (notes.verdict?.suits ?? []).includes(k)}
                          onPick={(k) => setPart('verdict', { suits: toggle(notes.verdict?.suits, k) })}
                          testId="suits"
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/** A labelled row of §10's pill chips — one-of or pick-any, the caller decides. */
function ChipGroup<T extends string>({
  label,
  options,
  labelOf,
  isOn,
  onPick,
  testId,
  lang,
  aside,
}: {
  label: string
  options: readonly T[]
  labelOf: (key: T) => ReactNode
  isOn: (key: T) => boolean
  onPick: (key: T) => void
  testId: string
  lang?: string
  /** Shown under the label — e.g. an info sheet about the options. */
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={label}>
      <span className="text-section-label uppercase text-ash-600">{label}</span>
      {aside}
      <div className="flex flex-wrap gap-1.5">
        {options.map((key) => {
          const on = isOn(key)
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-pressed={on}
              lang={lang}
              className={cn(
                'min-h-9 rounded-full border px-3 text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                on ? 'border-ginshu-600 bg-ginshu-600 text-ground' : 'border-divider text-ash-700 hover:bg-ash-200',
              )}
              data-testid={`detailed-notes-${testId}-${key}`}
            >
              {labelOf(key)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A temperature as the chips and the part summary show it: "suzuhie 15°". */
function temperatureName(k: keyof typeof SERVING_TEMPERATURE_TERMS): string {
  return `${SERVING_TEMPERATURE_TERMS[k].romaji} ${SERVING_TEMPERATURE_TERMS[k].degrees}°`
}
