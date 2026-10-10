'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CheckCircle, SlidersHorizontal, Trash } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { DetailedNotesSheet } from '@/components/journal/detailed-notes-sheet'
import { StarRating } from '@/components/journal/star-rating'
import { UndoNotice, announceNotice } from '@/components/journal/undo-notice'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import {
  DETAILED_NOTES_PARTS,
  type DetailedNotes,
  isPartFilled,
} from '@/lib/schemas/detailed-notes'
import type { QuickTag } from '@/lib/schemas/journal-entry'
import { isAxisQuickTag, quickTagAxis, quickTagsFor } from '@/lib/taste/quick-tags'
import { europeanDay, tastingDayOf } from '@/lib/taste/tasting-day'
import { ratingBand } from '@/lib/taste/rating-band'
import { rateNewTasting, undoTasting, updateTasting } from '@/lib/taste/tasting-actions'
import { cn } from '@/lib/utils'

/**
 * §5's log panel — "Your take". Reference screenshots 09 (before) and 10
 * (after).
 *
 * Rule 1, "the star is the save": there is no Save button. The first tap on a
 * star logs a new tasting; from then on the panel edits THAT entry — a second
 * tap re-rates it, the note saves as you type, a chip saves when tapped. A
 * notice offers Undo for a few seconds, and Undo removes the entry.
 *
 * Used on §5's result card after a scan and, through "Rate a new tasting", on
 * §9's bottle page. Maintainer-only (ADR-0020): callers render it only when the
 * server says this visitor can keep a journal, and the actions check again.
 *
 * After the first tap, "Add detailed notes" opens §10's sheet for the same
 * entry; once any part is filled it reads "Detailed notes" (v1.5 §5).
 */

export type TastingHistoryMeta =
  /** The visitor has never logged this sake. */
  | { kind: 'first' }
  /** The most recent earlier tasting. */
  | { kind: 'last'; triedAt: number; rating: number }

/** An earlier tasting, opened in the panel to edit or delete it. */
export interface ExistingTasting {
  entryId: string
  rating: number
  notes?: string
  tags?: readonly QuickTag[]
  detail?: DetailedNotes
  triedAt: number
  tastingNumber: number
}

interface Logged {
  entryId: string
  tastingNumber: number
  loggedAt: number
}

/** How long the Undo notice stays. §5 says "about 3s" (the prototype uses
 *  3.4); the maintainer found that too short to reach for Undo, so it is
 *  doubled. */
const NOTICE_MS = 6800
/** A typed note is saved once typing pauses this long, and always on blur. */
const NOTE_DEBOUNCE_MS = 700

export function TastingLogPanel({
  brandId,
  expressionId,
  sakeName,
  chart,
  history,
  onSaved,
  onDone,
  existing,
  onDeleted,
}: {
  brandId: number
  /** Log against this bottling of the sake rather than the sake itself (§9a). */
  expressionId?: string
  /** The sake's name as the page shows it — the delete confirmation names it. */
  sakeName: string
  /** This sake's flavor chart, or `null` without one. It picks the quick chips,
   *  and whether a rating moves the Palate. */
  chart: Readonly<Record<FlavorAxis, number>> | null
  /** Shown before the first tap. `null` when the caller does not know (a fresh scan). */
  history: TastingHistoryMeta | null
  /** Called after the journal changed (logged, or undone), e.g. to refresh the page. */
  onSaved?: () => void
  /** "Done" after logging hands the panel back to the caller (the bottle page
   *  closes it). Without it, "Done" folds the panel into a one-line "Logged"
   *  confirmation, which is what the scan's result card wants. */
  onDone?: () => void
  /** Open an earlier tasting instead of starting a new one — "You and this
   *  sake"'s Edit. Every change edits that entry, and nothing logs anew. */
  existing?: ExistingTasting
  /** Called once a tasting has been deleted. Without it the panel resets to
   *  "Your take", as after Undo. */
  onDeleted?: () => void
}) {
  const t = useTranslations('tasting')
  const tAxis = useTranslations('flavorAxis')
  const tNotes = useTranslations('detailedNotes')
  const tBand = useTranslations('rating.band')
  const format = useFormatter()
  const router = useRouter()

  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [logged, setLogged] = useState<Logged | null>(
    existing
      ? { entryId: existing.entryId, tastingNumber: existing.tastingNumber, loggedAt: existing.triedAt }
      : null,
  )
  const [note, setNote] = useState(existing?.notes ?? '')
  const [tags, setTags] = useState<readonly QuickTag[]>(existing?.tags ?? [])
  const [popKey, setPopKey] = useState<number | undefined>(undefined)
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [detail, setDetail] = useState<DetailedNotes | undefined>(existing?.detail)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  // Undo has its own transition so the panel can dim while it runs without
  // dimming on every note or chip save.
  const [isUndoing, startUndo] = useTransition()
  const [done, setDone] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const noteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** The note as last saved, so a blur after the debounce fired saves nothing. */
  const savedNote = useRef(existing?.notes ?? '')

  // Cleanup only: timers are scheduled from event handlers, not from effects.
  useEffect(
    () => () => {
      clearTimeout(noteTimer.current)
      clearTimeout(noticeTimer.current)
    },
    [],
  )

  const changed = () => {
    if (onSaved) onSaved()
    else router.refresh()
  }

  function rate(value: number) {
    setFailed(false)
    const previous = rating
    setRating(value)
    setPopKey(Date.now())

    startTransition(async () => {
      if (logged) {
        const result = await updateTasting(logged.entryId, { rating: value })
        if (result.status !== 'ok') {
          setRating(previous)
          setFailed(true)
          return
        }
        changed()
        return
      }
      const result = await rateNewTasting({ brandId, rating: value, expressionId })
      if (result.status !== 'ok') {
        setRating(previous)
        setFailed(true)
        return
      }
      setLogged({
        entryId: result.entryId,
        tastingNumber: result.tastingNumber,
        loggedAt: result.loggedAt,
      })
      setNoticeOpen(true)
      clearTimeout(noticeTimer.current)
      noticeTimer.current = setTimeout(() => setNoticeOpen(false), NOTICE_MS)
      changed()
    })
  }

  function saveNote(value: string) {
    clearTimeout(noteTimer.current)
    if (!logged || value.trim() === savedNote.current.trim()) return
    savedNote.current = value
    startTransition(async () => {
      const result = await updateTasting(logged.entryId, { notes: value })
      setFailed(result.status !== 'ok')
      if (result.status === 'ok') changed()
    })
  }

  function onNoteChange(value: string) {
    setNote(value)
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => saveNote(value), NOTE_DEBOUNCE_MS)
  }

  function toggleTag(tag: QuickTag) {
    if (!logged) return
    const next = tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag]
    setTags(next)
    startTransition(async () => {
      const result = await updateTasting(logged.entryId, { tags: [...next] })
      setFailed(result.status !== 'ok')
      if (result.status === 'ok') changed()
    })
  }

  function undo() {
    if (!logged) return
    const entryId = logged.entryId
    clearTimeout(noticeTimer.current)
    clearTimeout(noteTimer.current)
    setNoticeOpen(false)
    startUndo(async () => {
      const result = await undoTasting(entryId)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      // State set after an `await` is no longer part of the transition, so
      // without this inner one the panel resets at once and the page's
      // "You and this sake" catches up a beat later, when the refresh lands.
      // Inside one transition the reset and the refreshed page commit together.
      startUndo(() => {
        resetToFresh()
        changed()
      })
    })
  }

  /** Back to "Your take", as before the first tap. */
  function resetToFresh() {
    setLogged(null)
    setRating(0)
    setNote('')
    savedNote.current = ''
    setTags([])
    setDetail(undefined)
    setPopKey(undefined)
    setConfirmingDelete(false)
  }

  /** "Delete tasting", once confirmed. The same server delete as Undo, but
   *  reachable after the notice is gone — and for an earlier tasting. */
  function deleteTasting() {
    if (!logged) return
    const entryId = logged.entryId
    clearTimeout(noticeTimer.current)
    clearTimeout(noteTimer.current)
    setNoticeOpen(false)
    startUndo(async () => {
      const result = await undoTasting(entryId)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      // One transition with the refresh, as in `undo`.
      startUndo(() => {
        if (onDeleted) onDeleted()
        else resetToFresh()
        changed()
      })
      // No Undo after a confirmed delete — the confirmation was the safety
      // (v1.5 §5). Announced to the shell: this panel may be gone already.
      announceNotice(t('deleted'))
    })
  }

  /** "Done": the tasting is already saved — this says so and gets out of the
   *  way. A note still waiting for its debounce is saved first. */
  function finish() {
    saveNote(note)
    setSheetOpen(false)
    if (onDone) onDone()
    else setDone(true)
  }

  const deleteQuestion = logged
    ? t('deleteConfirm', {
        rating: format.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        name: sakeName,
        date: europeanDay(tastingDayOf(logged.loggedAt)),
      })
    : ''

  const ratingText =
    rating > 0
      ? t('ratingValue', {
          rating: format.number(rating, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          band: tBand(ratingBand(rating)),
        })
      : t('tapToRate')

  // v1.5 §9: an earlier tasting reads "Your tasting · 18.07.2026", and the
  // meta says how it behaves — there is no Save here either.
  const meta = existing
    ? t('savesAsYouGo')
    : logged
    ? t('loggedMeta', {
        // The visitor's own clock — "21:40" means the time where they are
        // sitting. Only ever formatted in the browser (it appears after a
        // tap), so the server and the client cannot disagree about it.
        time: format.dateTime(new Date(logged.loggedAt), {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        n: logged.tastingNumber,
      })
    : history?.kind === 'first'
      ? t('firstTime')
      : history?.kind === 'last'
        ? t('lastLogged', {
            // UTC, like the journal list and §9.3, so one tasting has one date.
            date: format.dateTime(new Date(history.triedAt), {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            }),
            rating: format.number(history.rating, { maximumFractionDigits: 1 }),
          })
        : null

  if (logged && done) {
    return (
      <section
        className="flex items-center gap-2 rounded-md border border-divider bg-ginshu-100 px-3.5 py-3 motion-safe:animate-yw-fade"
        aria-live="polite"
        data-testid="tasting-log-done"
      >
        <CheckCircle size={18} weight="fill" aria-hidden="true" className="shrink-0 text-ginshu-600" />
        <span className="min-w-0 flex-1 text-subtle text-ink">
          {t('logged')} · {ratingText}
        </span>
        <Link href={{ pathname: '/collection', query: { tab: 'journal' } }} className="shrink-0 text-meta text-ginshu-700 underline underline-offset-4">
          {t('inJournal')}
        </Link>
      </section>
    )
  }

  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-md border border-divider p-3.5 transition-[background-color,opacity] duration-200',
        logged ? 'bg-ginshu-100' : 'bg-ash-100',
        // v1.5 §5: "the panel dims to 45% for 0.2s".
        isUndoing && 'opacity-45',
      )}
      aria-busy={isUndoing || undefined}
      aria-labelledby={`tasting-log-${brandId}-heading`}
      data-testid="tasting-log-panel"
      data-logged={logged ? '' : undefined}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-3.5 w-0.5 rounded-full bg-ginshu-500" />
          <h3 id={`tasting-log-${brandId}-heading`} className="text-card-heading font-medium text-ink">
            {existing
              ? t('yourTastingOn', { date: europeanDay(tastingDayOf(existing.triedAt)) })
              : logged
                ? t('logged')
                : t('yourTake')}
          </h3>
        </div>
        {meta && (
          <span className="text-right text-section-label normal-case tracking-normal text-ash-600" data-testid="tasting-log-meta">
            {meta}
          </span>
        )}
      </div>

      {/* §5: "German: the label drops below the stars." `flex-wrap` does that
          wherever the words do not fit beside them, in any language. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating
          value={rating}
          onRate={rate}
          rateLabel={(v) => t('rateStar', { rating: v })}
          popKey={popKey}
          disabled={isPending && !logged}
        />
        <span
          className={cn('whitespace-nowrap text-body', rating > 0 ? 'text-ink' : 'text-ash-600')}
          aria-live="polite"
          data-testid="tasting-log-rating"
        >
          {ratingText}
        </span>
      </div>

      {logged ? (
        <div className="flex flex-col gap-2.5 motion-safe:animate-yw-fade" data-testid="tasting-log-after">
          <label className="sr-only" htmlFor={`tasting-note-${brandId}`}>
            {t('noteLabel')}
          </label>
          <textarea
            id={`tasting-note-${brandId}`}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            onBlur={(e) => saveNote(e.target.value)}
            maxLength={2000}
            placeholder={t('notePlaceholder')}
            className="min-h-16 w-full resize-y rounded-md border border-divider bg-ground px-3 py-2 text-body text-ink placeholder:italic placeholder:text-ash-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="tasting-log-note"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('quickTagsLabel')}>
            {quickTagsFor(chart).map((tag) => {
              const on = tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={on}
                  className={cn(
                    'min-h-8 rounded-full border px-3 text-meta transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                    on ? 'border-ginshu-600 bg-ginshu-600 text-ground' : 'border-divider text-ash-700 hover:bg-ash-200',
                  )}
                  data-testid={`tasting-tag-${tag.replace(':', '-')}`}
                >
                  {isAxisQuickTag(tag) ? tAxis(`${quickTagAxis(tag)}.label`) : t(`quickTags.${tag}`)}
                </button>
              )
            })}
          </div>
          {(() => {
            const filled = DETAILED_NOTES_PARTS.filter((p) => isPartFilled(detail, p)).length
            return (
              <div className="mt-0.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl border border-ash-300 text-subtle font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid="tasting-log-detailed"
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {filled > 0 ? tNotes('edit') : tNotes('open')}
                </button>
                {/* Not in §5: every tap already saved, but with no Save button
                    there was no way to say "I'm finished" — or to see that it
                    was kept. Same look as §10's "Done". */}
                <button
                  type="button"
                  onClick={finish}
                  className="min-h-[42px] shrink-0 rounded-xl border border-ginshu-400 px-4 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid="tasting-log-done-button"
                >
                  {t('done')}
                </button>
              </div>
            )
          })()}
          <DetailedNotesSheet
            entryId={logged.entryId}
            initial={detail}
            initialDay={tastingDayOf(logged.loggedAt)}
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            onSaved={(next) => {
              setDetail(next)
              changed()
            }}
          />
          {/* Interim, until #308 places edit and delete: a per-tasting delete
              is also what GDPR erasure needs below "delete everything". */}
          {confirmingDelete ? (
            // v1.5 §5: inline, in a ground-coloured box, naming what goes.
            <div
              className="flex flex-col gap-2 rounded-md bg-ground p-3"
              role="group"
              aria-label={deleteQuestion}
            >
              <span className="text-meta text-ink">{deleteQuestion}</span>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="min-h-9 rounded-md px-3 text-meta text-ash-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                >
                  {t('deleteNo')}
                </button>
                <button
                  type="button"
                  onClick={deleteTasting}
                  disabled={isUndoing}
                  className="min-h-9 rounded-md border border-ginshu-700 bg-ginshu-100 px-3 text-meta font-medium text-ginshu-700 transition-colors hover:bg-ginshu-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
                  data-testid="tasting-log-delete-confirm"
                >
                  {t('deleteYes')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-meta text-ash-600 transition-colors hover:text-ginshu-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="tasting-log-delete"
            >
              <Trash size={14} aria-hidden="true" />
              {t('delete')}
            </button>
          )}
        </div>
      ) : (
        <p className="text-meta text-ash-600">{t('hint')}</p>
      )}

      {failed && (
        <p role="alert" className="text-meta text-ginshu-700" data-testid="tasting-log-error">
          {t('error')}
        </p>
      )}

      {noticeOpen && (
        <UndoNotice
          message={chart ? t('noticePalate') : t('notice')}
          undoLabel={t('undo')}
          onUndo={undo}
        />
      )}
    </section>
  )
}
