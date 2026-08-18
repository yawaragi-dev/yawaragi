'use client'

// `'use client'` is load-bearing: this owns the log sheet's open state, a
// debounced typeahead over a Server Action, a star-rating picker, and a
// useTransition pending state that calls `logSakeToJournal` then
// `router.refresh()` so the /profile RSC re-renders with the new entry + map.
import { type FormEvent, useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  type JournalSearchCandidate,
  searchJournalSake,
} from '@/lib/taste/journal-search-action'
import { logSakeToJournal } from '@/lib/taste/journal-actions'
import type { JournalActionState } from '@/lib/taste/journal-action-state'

/** 'YYYY-MM-DD' → UTC-midnight epoch ms (matches the timeline's UTC grouping). */
function dateToEpoch(value: string): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? undefined : ms
}

export function JournalLogForm() {
  const t = useTranslations('journal')
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JournalSearchCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState<JournalSearchCandidate | null>(null)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [triedAt, setTriedAt] = useState('')
  const [error, setError] = useState<JournalActionState['status'] | null>(null)
  const [isSaving, startSaving] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Cleanup-only effect (no setState in the body, so no set-state-in-effect):
  // the debounce is scheduled from the input handler below, which is where React
  // 19 wants event-driven state to live, not in an effect reacting to `query`.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  // Debounced typeahead, driven from onChange. A picked sake means the input
  // shows its name, so searching only runs while the field is being typed into.
  function onQueryChange(value: string) {
    setQuery(value)
    clearTimeout(timerRef.current)
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    timerRef.current = setTimeout(async () => {
      const found = await searchJournalSake(trimmed)
      setResults(found)
      setSearching(false)
    }, 250)
  }

  function reset() {
    setQuery('')
    setResults([])
    setPicked(null)
    setRating(0)
    setNotes('')
    setTriedAt('')
    setError(null)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!picked || rating < 1) return // Save is disabled in this state; belt.
    startSaving(async () => {
      const next = await logSakeToJournal({
        brandId: picked.brandId,
        rating,
        notes: notes.trim() || undefined,
        triedAt: dateToEpoch(triedAt),
      })
      if (next.status === 'ok') {
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(next.status)
      }
    })
  }

  const canSave = picked !== null && rating >= 1 && !isSaving

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <SheetTrigger
        className="fixed bottom-6 right-6 z-40 rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-white dark:text-zinc-900"
        data-testid="journal-log-open"
      >
        ＋ {t('logCta')}
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>{t('logTitle')}</SheetTitle>
        </SheetHeader>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4" data-testid="journal-log-form">
          {/* Sake picker */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="journal-search">{t('searchLabel')}</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700">
                <span>
                  <span className="text-base" lang="ja">{picked.nameKanji}</span>{' '}
                  {picked.nameRomaji && <span className="text-sm text-zinc-500">{picked.nameRomaji}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="rounded text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:text-zinc-300"
                >
                  {t('searchChange')}
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  id="journal-search"
                  ref={searchRef}
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  autoComplete="off"
                  data-testid="journal-search"
                />
                {query.trim().length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                    {searching ? (
                      <p className="px-3 py-2 text-sm text-zinc-500" role="status">{t('searching')}</p>
                    ) : results.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-zinc-500">{t('searchNoResults')}</p>
                    ) : (
                      <ul>
                        {results.map((r) => (
                          <li key={r.brandId}>
                            <button
                              type="button"
                              onClick={() => {
                                setPicked(r)
                                setQuery('')
                                setResults([])
                                setSearching(false)
                                clearTimeout(timerRef.current)
                              }}
                              className="flex w-full items-baseline gap-2 px-3 py-2 text-left hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                            >
                              <span className="text-base" lang="ja">{r.nameKanji}</span>
                              {r.nameRomaji && <span className="text-sm text-zinc-500">{r.nameRomaji}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rating */}
          <div className="flex flex-col gap-1">
            <Label>{t('ratingLabel')}</Label>
            <div className="flex text-2xl text-amber-500" role="radiogroup" aria-label={t('ratingLabel')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={t('ratingStars', { rating: n })}
                  onClick={() => setRating(n)}
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  {n <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>

          {/* Notes (deep) */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="journal-notes">{t('notesLabel')}</Label>
            <Textarea
              id="journal-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notesPlaceholder')}
              rows={3}
              maxLength={2000}
            />
          </div>

          {/* Tried date */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="journal-tried">{t('triedAtLabel')}</Label>
            <Input
              id="journal-tried"
              type="date"
              value={triedAt}
              onChange={(e) => setTriedAt(e.target.value)}
              className="w-fit"
            />
          </div>

          {error && (
            <p role="alert" data-testid="journal-log-error" className="text-sm text-amber-700 dark:text-amber-300">
              {error === 'skipped_no_profile' ? t('errorNoProfile') : t('errorGeneric')}
            </p>
          )}

          <Button type="submit" disabled={!canSave} aria-busy={isSaving} data-testid="journal-log-save" className="w-fit">
            {isSaving ? t('saving') : t('save')}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
