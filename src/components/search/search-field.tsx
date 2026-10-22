'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isCatalogueQuerySpecific } from '@/lib/sakenowa/catalogue-query'
import { cn } from '@/lib/utils'
import { ownBottlingSuggestions } from '@/lib/search/own-bottling-suggestions'

export interface Suggestion {
  brandId: number
  nameKanji: string
  nameRomaji: string | null
  breweryKanji: string | null
  breweryRomaji: string | null
  /** Found only under another name it is sold by (#413). */
  matchedAlias?: string
  /** The brewery's prefecture, for the meta line (v1.9 U1). */
  prefecture?: string
  href: string
}

/** One of the visitor's own bottlings (v1.9 U4), listed above the catalogue. */
export interface OwnSuggestion {
  id: string
  name: string
  href: string
}

type Fetched = { query: string; rows: readonly Suggestion[]; own?: readonly OwnSuggestion[] }

/** A row of the list, whichever kind: what the keyboard moves through. */
type Row = { key: string; href: string; own?: OwnSuggestion; sake?: Suggestion }

/** Long enough to skip the keystrokes of a word being typed, short enough to feel live. */
const DEBOUNCE_MS = 150

/**
 * §8's field, with the list of matching sakes that opens under it as the
 * visitor types (#326, ahead of the design).
 *
 * The GET form around it stays the floor: with JavaScript off, or before
 * hydration, or when the list is closed, Enter runs the full search exactly
 * as before. The list only adds a shortcut — picking a row opens that sake's
 * page. It is a combobox in the ARIA sense: arrow keys move through the rows
 * (`aria-activedescendant`, focus stays in the field), Enter on a row opens
 * it, Escape closes the list, and Enter with no row chosen submits the form.
 *
 * Each request is aborted when the next keystroke lands, and a reply is only
 * shown while it still answers what is in the field, so a slow answer for
 * "da" never replaces the one for "dass". A failed request shows nothing.
 * The query the page already shows results for opens no list.
 */
export function SearchField({
  id,
  defaultValue,
  autoFocus,
  placeholder,
  locale,
  listLabel,
  alsoSoldAs,
  yours,
  yourBottling,
  footer,
  fetchSuggestions = defaultFetch,
}: {
  id: string
  defaultValue: string
  autoFocus: boolean
  placeholder: string
  locale: string
  listLabel: string
  /** "Also sold as {name}", with `{name}` left in for the row's other name. */
  alsoSoldAs: string
  /** The tag on the visitor's own bottlings: "Yours". */
  yours: string
  /** Their meta line: "Your bottling". */
  yourBottling: string
  /** Under the rows: the romaji caveat and the Sakenowa credit. */
  footer: React.ReactNode
  fetchSuggestions?: (query: string, locale: string, signal: AbortSignal) => Promise<Fetched>
}) {
  const router = useRouter()
  const listId = useId()
  const [value, setValue] = useState(defaultValue)
  const [fetched, setFetched] = useState<Fetched>({ query: '', rows: [] })
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(-1)

  const query = value.trim()
  const wanted = isCatalogueQuerySpecific(query) && query !== defaultValue.trim()

  useEffect(() => {
    if (!wanted) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      fetchSuggestions(query, locale, controller.signal)
        .then((result) => setFetched(result))
        .catch(() => {
          // Aborted, offline or failed: no list. Enter still searches.
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [wanted, query, locale, fetchSuggestions])

  const answered = wanted && fetched.query === query
  const rows: Row[] = answered
    ? [
        ...(fetched.own ?? []).map((own) => ({ key: `own-${own.id}`, href: own.href, own })),
        ...fetched.rows.map((sake) => ({ key: `sake-${sake.brandId}`, href: sake.href, sake })),
      ]
    : []
  const open = !dismissed && rows.length > 0
  const current = open && active >= 0 && active < rows.length ? active : -1

  const choose = (row: Row) => {
    setDismissed(true)
    router.push(row.href)
  }

  return (
    <>
      <input
        // A combobox rather than §8's plain searchbox: the field now owns a
        // list. `type="text"` for the reason the page gives (no UA clear button).
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
        inputMode="search"
        name="q"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setDismissed(false)
          setActive(-1)
        }}
        onKeyDown={(event) => {
          if (!open) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((i) => (i + 1) % rows.length)
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((i) => (i <= 0 ? rows.length - 1 : i - 1))
          } else if (event.key === 'Escape') {
            event.preventDefault()
            setDismissed(true)
          } else if (event.key === 'Enter' && current >= 0) {
            event.preventDefault()
            choose(rows[current]!)
          }
        }}
        onBlur={(event) => {
          // Moving into the list (its credit link) keeps it open.
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) setDismissed(true)
        }}
        onFocus={() => setDismissed(false)}
        autoFocus={autoFocus}
        maxLength={80}
        enterKeyHint="search"
        autoComplete="off"
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-card-heading text-ink placeholder:text-ash-500 focus:outline-none"
        id={id}
        data-testid="search-input"
      />
      {open && (
        <div
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-ash-300 bg-surface shadow-yw-sm"
          data-testid="search-suggestions"
        >
          <ul role="listbox" id={listId} aria-label={listLabel}>
            {rows.map((row, index) => (
              <li
                key={row.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === current}
                // Keeps focus (and the list) in the field until the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(row)}
                className={cn(
                  'flex min-h-12 cursor-pointer flex-col justify-center gap-0.5 border-b border-divider px-3 py-2',
                  index === current ? 'bg-ash-200' : 'hover:bg-ash-100',
                )}
                data-testid={row.own ? 'search-suggestion-own' : 'search-suggestion'}
              >
                {row.own ? (
                  // v1.9 U4: the visitor's own bottling, above the catalogue.
                  <>
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-subtle font-medium text-ink">{row.own.name}</span>
                      <span className="rounded-full border border-ash-400 px-1.5 text-micro text-ash-700">{yours}</span>
                    </span>
                    <span className="text-meta text-ash-600">{yourBottling}</span>
                  </>
                ) : (
                  row.sake && (
                    // v1.9 U1: Latin name first at 14px, the kanji after it at
                    // 12px, as §8's rows do; rows wrap, nothing is cut.
                    <>
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-subtle font-medium text-ink" lang={row.sake.nameRomaji ? undefined : 'ja'}>
                          {row.sake.nameRomaji ?? row.sake.nameKanji}
                        </span>
                        {row.sake.nameRomaji && (
                          <span className="text-meta text-ash-600" lang="ja">
                            {row.sake.nameKanji}
                          </span>
                        )}
                      </span>
                      {(row.sake.breweryRomaji || row.sake.breweryKanji || row.sake.prefecture) && (
                        <span className="text-meta text-ash-600">
                          {[row.sake.breweryRomaji ?? row.sake.breweryKanji, row.sake.prefecture].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {row.sake.matchedAlias && (
                        <span className="text-meta text-ash-700">{alsoSoldAs.replace('{name}', row.sake.matchedAlias)}</span>
                      )}
                    </>
                  )
                )}
              </li>
            ))}
          </ul>
          <div className="px-3 py-2 text-meta text-ash-600">{footer}</div>
        </div>
      )}
    </>
  )
}

async function defaultFetch(query: string, locale: string, signal: AbortSignal): Promise<Fetched> {
  const params = new URLSearchParams({ q: query, locale })
  // The catalogue from the public API; the visitor's own bottlings from a
  // Server Action, which has their session (v1.9 U4). Either failing alone
  // leaves the other's rows.
  const [response, own] = await Promise.all([
    fetch(`/api/search-suggest?${params}`, { signal, credentials: 'same-origin' }),
    ownBottlingSuggestions(query, locale).catch(() => []),
  ])
  if (!response.ok) throw new Error(`suggest ${response.status}`)
  const body = (await response.json()) as { query: string; rows: Suggestion[] }
  return { query: body.query.trim(), rows: body.rows, own }
}
