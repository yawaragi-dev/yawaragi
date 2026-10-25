'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DotsThree } from '@phosphor-icons/react/dist/ssr'
import * as actions from '@/lib/collection/bottle-history-actions'
import { reachable } from '@/lib/network/settle-request'

// A lost network answers "unavailable" instead of throwing to the error page.
const forgetBottleHad = reachable(actions.forgetBottleHad)

/**
 * One row of "Bottles you've had" (design v1.10, AB6), with its ⋯: "rows are
 * removed one by one (swipe or the row's ⋯, written)". The ⋯ opens an inline
 * question under the row — the bottling page's delete pattern — because
 * the removal is permanent: it takes the bottle out of the history, the kept
 * counts and the export. Client-side for the question's state and the
 * pending label; the row's content comes from the server as `children`.
 */
export function HadBottleRow({
  bottleId,
  name,
  readOnly,
  children,
}: {
  bottleId: string
  name: string
  /** The sample collection: no ⋯. */
  readOnly: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('bottlesHad')
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()
  const question = t('question', { name })

  function remove() {
    setFailed(false)
    startTransition(async () => {
      const result = await forgetBottleHad(bottleId)
      if (result.status === 'ok' || result.status === 'not_found') {
        setAsking(false)
        router.refresh()
      } else {
        setFailed(true)
      }
    })
  }

  return (
    <li className="flex flex-col border-b border-divider" data-testid="bottles-had-bottle">
      <div className="flex items-center gap-1">
        {children}
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setFailed(false)
              setAsking((v) => !v)
            }}
            aria-label={t('more', { name })}
            aria-expanded={asking}
            className="flex size-11 shrink-0 items-center justify-center rounded-md text-ash-600 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-needs-network=""
            data-testid="bottles-had-more"
          >
            <DotsThree size={20} weight="bold" aria-hidden="true" />
          </button>
        )}
      </div>
      {asking && (
        <div
          className="mb-3 flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-yw-sm"
          role="group"
          aria-label={question}
          data-testid="bottles-had-confirm"
        >
          <p className="text-subtle leading-normal text-ink">{question}</p>
          {failed && (
            <p className="text-meta text-ginshu-700" role="alert">
              {t('error')}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setAsking(false)
                setFailed(false)
              }}
              className="min-h-11 flex-1 rounded-xl px-3 text-body font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="bottles-had-keep"
            >
              {t('keep')}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-busy={pending}
              className="min-h-11 flex-1 rounded-xl border border-ginshu-700 bg-ginshu-100 px-3 text-body font-medium text-ink transition-colors hover:bg-ginshu-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
              data-needs-network=""
              data-testid="bottles-had-remove"
            >
              {pending ? t('removing') : t('remove')}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
