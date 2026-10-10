'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { PlusCircle } from '@phosphor-icons/react/dist/ssr'
import { useRouter } from '@/i18n/navigation'
import { addOwnBottling } from '@/lib/collection/expression-actions'

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

  function add(name: string, brewery?: string) {
    const trimmed = name.trim()
    if (trimmed.length === 0 || pending) return
    setFailed(false)
    startTransition(async () => {
      const result = await addOwnBottling({ brandId: null, name: trimmed, brewery })
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
 * visitor may have just fixed them from the label.
 */
export function KeepItAnyway({ name, brewery }: { name: string; brewery: string }) {
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
        onClick={() => add(name, brewery)}
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

/** §8's dashed row under the results: "Add “{query}” yourself". */
export function AddItYourselfRow({ query }: { query: string }) {
  const t = useTranslations('bottling')
  const { add, pending, failed } = useAddUnlistedBottling()

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => add(query)}
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-dashed border-ash-400 px-4 py-2.5 text-left transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
        data-testid="search-add-yourself"
      >
        <PlusCircle size={20} className="shrink-0 text-ginshu-700" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="break-words text-card-heading font-medium text-ink">
            {pending ? t('adding') : t('addYourself', { query })}
          </span>
          <span className="text-meta text-ash-700">{t('addYourselfHint')}</span>
        </span>
      </button>
      {failed && (
        <p className="text-meta text-ginshu-700" role="alert" data-testid="search-add-yourself-error">
          {t('error')}
        </p>
      )}
    </div>
  )
}
