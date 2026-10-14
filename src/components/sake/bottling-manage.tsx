'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CaretRight, PencilSimple, Trash } from '@phosphor-icons/react/dist/ssr'
import { BottlingNameForm } from '@/components/sake/bottling-name-form'
import { useRouter } from '@/i18n/navigation'
import { setPendingUndo } from '@/lib/collection/deleted-bottling-store'
import { deleteOwnBottling, renameOwnBottling } from '@/lib/collection/expression-actions'
import type { BottlingDetails } from '@/lib/schemas/expression'

/**
 * §9a's "This bottling" group (design v1.6.2, screenshots 68–70): the last
 * section of a bottling the visitor added, with two rows.
 *
 * - **Rename** opens the naming form in place, prefilled. For a bottle with no
 *   sake it carries the brewery too.
 * - **Delete bottling** asks first, inline, and says what happens to the
 *   tastings and bottles: under a sake they stay, under the sake; with none
 *   they go with the bottling. Then it lands on the sake's page — or on the
 *   journal, when there is no sake — where the notice offers Undo.
 */
export function BottlingManage({
  expressionId,
  name,
  brewery,
  details,
  sake,
  tastings,
  bottles,
}: {
  expressionId: string
  name: string
  /** The brewery as given; only a bottle with no sake has one of its own. */
  brewery: string | undefined
  /** Grade, styles and polishing as stored (design v1.7 D5). */
  details?: BottlingDetails
  /** The sake it belongs to, or `null`. */
  sake: { brandId: number; name: string } | null
  /** How many tastings and cellar bottles are logged against it. */
  tastings: number
  bottles: number
}) {
  const t = useTranslations('bottling')
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'renaming' | 'confirming'>('idle')
  const [failed, setFailed] = useState(false)
  const [pending, startTransition] = useTransition()

  function rename(nextName: string, nextBrewery: string, nextDetails?: BottlingDetails) {
    setFailed(false)
    startTransition(async () => {
      const result = await renameOwnBottling({
        expressionId,
        name: nextName,
        ...(sake ? {} : { brewery: nextBrewery }),
        ...(nextDetails ? { details: nextDetails } : {}),
      })
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setMode('idle')
      router.refresh()
    })
  }

  function remove() {
    setFailed(false)
    startTransition(async () => {
      const result = await deleteOwnBottling(expressionId)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setPendingUndo({ deleted: result.undo, at: Date.now() })
      if (sake) {
        router.push({ pathname: '/sake/[brandId]', params: { brandId: String(sake.brandId) } })
      } else {
        router.push({ pathname: '/collection', query: { tab: 'journal' } })
      }
    })
  }

  // What the delete does with what is logged against the bottling.
  const holdings = { tastings, bottles, sake: sake?.name ?? '' }
  const consequence =
    tastings > 0 && bottles > 0
      ? t(sake ? 'staysBoth' : 'goesBoth', holdings)
      : tastings > 0
        ? t(sake ? 'staysTastings' : 'goesTastings', holdings)
        : bottles > 0
          ? t(sake ? 'staysBottles' : 'goesBottles', holdings)
          : null
  const question = [t('deleteQuestion', { name }), consequence].filter(Boolean).join(' ')

  const row =
    'flex min-h-[50px] w-full items-center gap-3.5 border-b border-divider text-left text-card-heading text-ink transition-colors last:border-b-0 hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

  return (
    <section className="flex flex-col gap-1" data-testid="bottling-manage">
      <h2 className="text-section-label uppercase text-ash-600">{t('thisBottling')}</h2>

      {mode === 'renaming' ? (
        <div className="pt-2">
          <BottlingNameForm
            mode="rename"
            initialName={name}
            initialBrewery={brewery ?? ''}
            withBrewery={sake === null}
            withDetails
            initialDetails={details}
            pending={pending}
            failed={failed}
            onSubmit={rename}
            onCancel={() => {
              setMode('idle')
              setFailed(false)
            }}
            testId="bottling-rename"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setMode('renaming')
          }}
          className={row}
          data-testid="bottling-rename-open"
        >
          <PencilSimple size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
          <span className="flex-1">{t('rename')}</span>
          <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
        </button>
      )}

      {mode === 'confirming' ? (
        // §9's delete dialog, inline: a box naming what goes and what stays.
        <div
          className="mt-2 flex flex-col gap-3 rounded-xl bg-surface p-3.5 shadow-yw-sm"
          role="group"
          aria-label={question}
          data-testid="bottling-delete-confirm"
        >
          <p className="text-subtle leading-normal text-ink">{question}</p>
          {failed && (
            <p className="text-meta text-ginshu-700" role="alert">
              {t('deleteError')}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMode('idle')
                setFailed(false)
              }}
              className="min-h-11 flex-1 rounded-xl px-3 text-body font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="bottling-delete-keep"
            >
              {t('keepIt')}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              aria-busy={pending}
              className="min-h-11 flex-1 rounded-xl border border-ginshu-700 bg-ginshu-100 px-3 text-body font-medium text-ink transition-colors hover:bg-ginshu-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50"
              data-testid="bottling-delete-yes"
            >
              {pending ? t('deleting') : t('deleteYes')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setFailed(false)
            setMode('confirming')
          }}
          className={row}
          data-testid="bottling-delete-open"
        >
          <Trash size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
          <span className="flex-1">{t('deleteBottling')}</span>
        </button>
      )}
    </section>
  )
}
