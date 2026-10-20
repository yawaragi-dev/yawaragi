'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { BottlingNameForm } from '@/components/sake/bottling-name-form'
import type { BottlingDetails } from '@/lib/schemas/expression'
import { useRouter } from '@/i18n/navigation'
import * as saves from '@/lib/collection/expression-actions'
import { reachable } from '@/lib/network/settle-request'

// Saves that the network loses answer "unavailable" (Couldn't save) instead
// of throwing to the error page (design question S6).
const addOwnBottling = reachable(saves.addOwnBottling)

/**
 * The two ways to keep a bottle the catalogue does not know (design v1.6,
 * ADR-0025): "Keep it anyway" on a scan outcome (§5a) and "Add it yourself"
 * in search (§8). Both create an own bottling with no sake — a name, and the
 * brewery when there is one — and open its page with the rating panel up.
 *
 * The design sends both to §5's result card in "Your own entry" mode
 * (screenshot 65). That card is the scan screen's; what it holds for an own
 * entry — the name, "Your take", "Not in the catalogue yet", a way to its
 * page — is the bottling's page itself, so they land there, one screen
 * sooner.
 */
function useAddUnlistedBottling() {
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  function add(
    name: string,
    brewery?: string,
    read?: { aiName?: boolean; aiBrewery?: boolean },
    details?: BottlingDetails,
  ) {
    const trimmed = name.trim()
    if (trimmed.length === 0 || pending) return
    setFailed(false)
    startTransition(async () => {
      const result = await addOwnBottling({
        brandId: null,
        name: trimmed,
        brewery,
        ...(read?.aiName ? { aiName: true } : {}),
        ...(read?.aiBrewery && brewery?.trim() ? { aiBrewery: true } : {}),
        ...(details && Object.keys(details).length > 0 ? { details } : {}),
      })
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      router.push({
        pathname: '/bottling/[id]',
        params: { id: result.expressionId },
        query: { rate: '1' },
      })
    })
  }

  return { add, pending, failed }
}

/**
 * §5a's dashed "Keep it anyway" card, shown whenever something was read. It
 * saves the name and brewery as they stand in "What we read" above it — the
 * visitor may have just fixed them from the label. `aiName` / `aiBrewery`
 * say a field still holds the model's Latin reading (design v1.7.1, H3).
 */
export function KeepItAnyway({
  name,
  brewery,
  aiName = false,
  aiBrewery = false,
}: {
  name: string
  brewery: string
  aiName?: boolean
  aiBrewery?: boolean
}) {
  const t = useTranslations('bottling')
  const { add, pending, failed } = useAddUnlistedBottling()

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-dashed border-ash-400 p-4"
      data-testid="scan-outcome-keep"
    >
      <div className="flex flex-col gap-1">
        <span className="text-card-heading font-medium text-ink">{t('keepTitle')}</span>
        <p className="text-subtle leading-normal text-ash-700">{t('keepBody')}</p>
      </div>
      {failed && (
        <p className="text-meta text-ginshu-700" role="alert" data-testid="scan-outcome-keep-error">
          {t('error')}
        </p>
      )}
      <button
        // The outcome screen sits inside the scan form; this must not submit it.
        type="button"
        onClick={() => add(name, brewery, { aiName, aiBrewery })}
        disabled={name.trim().length === 0 || pending}
        aria-busy={pending}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 px-4 text-subtle font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
        data-testid="scan-outcome-keep-add"
      >
        <PlusCircle size={16} aria-hidden="true" />
        {pending ? t('adding') : t('addThisBottling')}
      </button>
    </div>
  )
}

/**
 * §8's dashed row under the results: "Add “{query}” yourself". A tap opens
 * the naming form in place — the same one "Add your bottling" opens on a
 * sake's page — with the query as the name to confirm or correct, and the
 * brewery as an optional second field. What was typed into a search box is a
 * query, not yet a name: "fukuchiyo" in lower case, half a word, a typo.
 * Saving it as it stood left no way to fix it (maintainer review, 2026-10-11).
 */
export function AddItYourselfRow({ query }: { query: string }) {
  const t = useTranslations('bottling')
  const { add, pending, failed } = useAddUnlistedBottling()
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <BottlingNameForm
        initialName={query}
        withBrewery
        withDetails
        pending={pending}
        failed={failed}
        onSubmit={(name, brewery, details) => add(name, brewery || undefined, undefined, details)}
        onCancel={() => setOpen(false)}
        testId="search-add-yourself"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-ash-400 px-4 py-2.5 text-left transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid="search-add-yourself"
    >
      <PlusCircle size={20} className="shrink-0 text-ginshu-700" aria-hidden="true" />
      <span className="flex min-w-0 flex-col">
        <span className="break-words text-card-heading font-medium text-ink">
          {t('addYourself', { query })}
        </span>
        <span className="text-meta text-ash-700">{t('addYourselfHint')}</span>
      </span>
    </button>
  )
}

/**
 * §7's "Add it" on a menu line the catalogue has no row for (design v1.7 C5):
 * the same naming form as "Add it yourself", opened in place under the line,
 * with the line as printed to confirm or correct.
 */
export function AddListLineYourself({ printed, label }: { printed: string; label: string }) {
  const { add, pending, failed } = useAddUnlistedBottling()
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <div className="basis-full pb-3">
        <BottlingNameForm
          initialName={printed}
          withBrewery
          withDetails
          pending={pending}
          failed={failed}
          onSubmit={(name, brewery, details) => add(name, brewery || undefined, undefined, details)}
          onCancel={() => setOpen(false)}
          testId="list-add-yourself"
        />
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid="list-unmatched-add"
    >
      <PlusCircle size={16} aria-hidden="true" />
      {label}
    </button>
  )
}
