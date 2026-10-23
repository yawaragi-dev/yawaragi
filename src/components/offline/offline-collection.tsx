'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { WifiSlash } from '@phosphor-icons/react/dist/ssr'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { StarRow } from '@/components/journal/star-row'
import { type OfflineCollectionCopy, readOfflineCopy } from '@/lib/offline/collection-copy'
import { cn } from '@/lib/utils'

/** Ask the app shell to show the saved copy (Collection tapped with no connection). */
export const OPEN_OFFLINE_COLLECTION = 'yw:offline-collection'
/** Ask for one tasting's sheet from the copy (a journal row tapped with no connection). */
export const OPEN_OFFLINE_ENTRY = 'yw:offline-entry'

type Entry = OfflineCollectionCopy['journal'][number]

export interface OfflineCollectionMessages {
  title: string
  journal: string
  cellar: string
  /** "Offline · Your journal as of {time}" */
  journalAsOf: string
  cellarAsOf: string
  changesWait: string
  /** "From the copy on this phone, as of {time}. The sake's page and editing need a connection." */
  sheetFoot: string
  /** "{n} of 5 stars" */
  stars: string
  pourAndRate: string
  finished: string
  openBottle: string
  removeOne: string
  /** "{bottles} bottles · {open} open" */
  summary: string
  empty: string
}

/**
 * Design v1.9, Z (121, 122): the journal and cellar from the copy saved on
 * this phone, inside the app shell. Opened when Collection is tapped with the
 * phone offline (see `<NavigationFeedback />`), it says what it is — "Offline
 * · Your journal as of 14:02 · Changes wait for a connection." — shows the
 * cellar's actions greyed (Z2) and opens a small sheet for a tapped row (Z3).
 * The same sheet answers a journal row tapped on the live Collection while
 * offline. When the connection is back it gives way to the real screen.
 */
export function OfflineCollection({ messages, locale }: { messages: OfflineCollectionMessages; locale: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [copy, setCopy] = useState<OfflineCollectionCopy | null>(null)
  const [open, setOpen] = useState<{ tab: 'journal' | 'cellar' } | null>(null)
  const [sheet, setSheet] = useState<Entry | null>(null)

  useEffect(() => {
    const load = () =>
      readOfflineCopy()
        .then((found) => found ?? null)
        .catch(() => null)
    const onOpen = (event: Event) => {
      const tab = (event as CustomEvent<{ tab?: string }>).detail?.tab === 'cellar' ? 'cellar' : 'journal'
      void load().then((found) => {
        setCopy(found)
        if (found) setOpen({ tab })
      })
    }
    const onEntry = (event: Event) => {
      const id = (event as CustomEvent<{ id: string }>).detail?.id
      void load().then((found) => {
        setCopy(found)
        setSheet(found?.journal.find((e) => e.id === id) ?? null)
      })
    }
    // Back online: the real Collection, with its actions, takes over.
    const onOnline = () =>
      setOpen((was) => {
        if (was) router.push(`/${locale}/collection?tab=${was.tab}`)
        return null
      })
    window.addEventListener(OPEN_OFFLINE_COLLECTION, onOpen)
    window.addEventListener(OPEN_OFFLINE_ENTRY, onEntry)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener(OPEN_OFFLINE_COLLECTION, onOpen)
      window.removeEventListener(OPEN_OFFLINE_ENTRY, onEntry)
      window.removeEventListener('online', onOnline)
    }
  }, [locale, router])

  // A tab tapped while the copy is up leaves it (the tab bar stays live).
  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      const tab = (event.target as Element | null)?.closest?.('[data-testid="tab-bar"] a[href]')
      if (tab && !tab.getAttribute('href')?.includes('/collection')) setOpen(null)
    }
    document.addEventListener('click', onClick, { capture: true })
    return () => document.removeEventListener('click', onClick, { capture: true })
  }, [open])

  const time = (ms: number) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(ms)
  const day = (ms: number, part: 'day' | 'month') =>
    new Intl.DateTimeFormat(locale, part === 'day' ? { day: '2-digit', timeZone: 'UTC' } : { month: 'short', timeZone: 'UTC' }).format(ms)
  const visible = open && copy && !pathname.endsWith('/collection')

  return (
    <>
      {visible && (
        <div
          className="fixed inset-x-0 top-0 bottom-[var(--tab-bar-h)] z-30 overflow-y-auto bg-background"
          data-testid="offline-collection-in-app"
        >
          <div
            role="status"
            className="flex min-h-9 items-center gap-2.5 bg-ash-200 px-4 py-1.5 shadow-[0_1px_0_var(--color-divider)]"
          >
            <WifiSlash size={16} aria-hidden="true" className="shrink-0 text-ash-700" />
            <p className="min-w-0 flex-1 text-meta text-ink">
              {(open.tab === 'cellar' ? messages.cellarAsOf : messages.journalAsOf).replace('{time}', time(copy.savedAt))}
              <span className="text-ash-700"> · {messages.changesWait}</span>
            </p>
          </div>
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-6">
            <h1 className="text-tab-title font-medium text-ink">{messages.title}</h1>
            <div className="flex self-start rounded-lg border border-divider" role="tablist">
              {(['journal', 'cellar'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={open.tab === tab}
                  onClick={() => setOpen({ tab })}
                  className={cn(
                    'flex min-h-9 items-center px-3.5 text-subtle',
                    open.tab === tab
                      ? '-m-px rounded-lg border border-ginshu-500 bg-ginshu-100 font-medium text-ginshu-700'
                      : 'text-ink',
                  )}
                  data-testid={`offline-in-app-${tab}`}
                >
                  {tab === 'journal' ? messages.journal : messages.cellar}
                </button>
              ))}
            </div>

            {open.tab === 'journal' ? (
              copy.journal.length === 0 ? (
                <p className="text-body text-ash-600">{messages.empty}</p>
              ) : (
                <ul className="flex flex-col" role="list" data-testid="offline-in-app-journal">
                  {copy.journal.map((entry, index) => (
                    <li key={entry.id ?? index} className="border-b border-divider">
                      <button
                        type="button"
                        onClick={() => setSheet(entry)}
                        className="flex min-h-14 w-full items-start gap-3 py-3 text-left transition-colors hover:bg-ash-100"
                      >
                        <span className="flex w-10 shrink-0 flex-col items-start pt-0.5">
                          <span className="text-lg-alt font-medium text-ink">{day(entry.triedAt, 'day')}</span>
                          <span className="text-micro uppercase text-ash-600">{day(entry.triedAt, 'month')}</span>
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="text-card-heading font-medium text-ink">{entry.name}</span>
                          {entry.kanji && (
                            <span className="text-meta text-ash-600" lang="ja">
                              {entry.kanji}
                            </span>
                          )}
                          {entry.note && <span className="text-subtle italic text-ash-700">“{entry.note}”</span>}
                        </span>
                        {entry.rating ? (
                          <span role="img" className="shrink-0 pt-1" aria-label={messages.stars.replace('{n}', String(entry.rating))}>
                            <StarRow value={entry.rating} size={12} />
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <section className="flex flex-col" data-testid="offline-in-app-cellar">
                <p className="pb-2 text-meta text-ash-700">
                  {messages.summary
                    .replace('{bottles}', String(copy.cellar.reduce((n, r) => n + r.count, 0)))
                    .replace('{open}', String(copy.cellar.filter((r) => r.open).length))}
                </p>
                <ul className="flex flex-col" role="list">
                  {copy.cellar.map((row, index) => (
                    <li key={index} className="flex flex-col gap-1.5 border-b border-divider py-3">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-card-heading font-medium text-ink">{row.name}</span>
                        <span className="shrink-0 text-meta text-ash-700">
                          × {row.count}
                          {row.sizeMl ? ` · ${row.sizeMl} ml` : ''}
                        </span>
                      </span>
                      {row.kanji && (
                        <span className="text-meta text-ash-600" lang="ja">
                          {row.kanji}
                        </span>
                      )}
                      {/* Z2: the actions stay, greyed — hiding them would make rows jump when the signal returns. */}
                      <span className="mt-1 flex gap-3 opacity-45" aria-hidden="true">
                        <span className="rounded-lg border border-ash-300 px-3 py-1.5 text-meta text-ink">
                          {row.open ? messages.pourAndRate : messages.openBottle}
                        </span>
                        <span className="px-1 py-1.5 text-meta text-ginshu-700">
                          {row.open ? messages.finished : messages.removeOne}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      <Sheet open={sheet !== null} onOpenChange={(next) => !next && setSheet(null)}>
        <SheetContent side="bottom" className="flex flex-col gap-2 p-5" data-testid="offline-entry-sheet">
          {sheet && copy && (
            <>
              <SheetTitle className="text-title font-medium text-ink">{sheet.name}</SheetTitle>
              {sheet.kanji && (
                <p className="text-meta text-ash-600" lang="ja">
                  {sheet.kanji}
                </p>
              )}
              {sheet.brewery && <p className="text-meta text-ash-700">{sheet.brewery}</p>}
              {sheet.rating ? (
                <p className="flex items-center gap-2 text-subtle text-ink">
                  <StarRow value={sheet.rating} size={18} />
                  {sheet.rating.toFixed(1)} · {day(sheet.triedAt, 'day')} {day(sheet.triedAt, 'month')}
                </p>
              ) : null}
              {sheet.note && <p className="text-subtle italic text-ink">“{sheet.note}”</p>}
              <p className="mt-2 flex items-start gap-2 border-t border-divider pt-3 text-meta text-ash-700">
                <WifiSlash size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
                {messages.sheetFoot.replace('{time}', time(copy.savedAt))}
              </p>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
