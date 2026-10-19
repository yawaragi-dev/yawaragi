'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LockSimpleOpen, Star } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { CellarSheet } from '@/components/collection/cellar-sheet'
import * as saves from '@/lib/collection/cellar-actions'
import { reachable } from '@/lib/network/settle-request'
import type { CellarSize } from '@/lib/schemas/cellar-bottle'
import type { CellarSheetValues, CellarTarget } from '@/lib/schemas/cellar-input'

// Saves that the network loses answer "unavailable" (Couldn't save) instead
// of throwing to the error page (design question S6).
const editCellarRow = reachable(saves.editCellarRow)
const finishCellarBottle = reachable(saves.finishCellarBottle)
const openCellarBottle = reachable(saves.openCellarBottle)
const removeFromCellar = reachable(saves.removeFromCellar)

/**
 * A Cellar row's two buttons (§11). Open bottle: "Pour & rate" (to the page of
 * what the bottle is — the sake's, or the bottling's — with §5's panel already
 * open) · "Finished". Sealed: "Open a bottle" ·
 * "Remove" — one bottle at a time, so it reads "Remove one" while there are
 * several. Each change re-renders the list from the store.
 *
 * Then "Edit", which opens the "Add to cellar" sheet on this row's count, size
 * and nama (design v1.6.2: "Same sheet to edit a cellar row"). The design
 * does not say where that starts from; a third, quiet action keeps it on the
 * row it changes.
 */
export function CellarRowActions({
  target,
  rowKey,
  name,
  isOpen,
  count,
  sizeMl,
  nama,
}: {
  /** The sake or the bottling this row holds bottles of. */
  target: CellarTarget
  /** The row's store key: what every action here acts on. */
  rowKey: string
  /** The row's name, for the sheet. */
  name: string
  isOpen: boolean
  /** Bottles on the row. */
  count: number
  sizeMl: CellarSize | null
  nama: boolean
}) {
  const t = useTranslations('cellar')
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function run(action: (rowKey: string) => Promise<{ status: string }>) {
    setFailed(false)
    startTransition(async () => {
      const result = await action(rowKey)
      if (result.status !== 'ok') setFailed(true)
      else router.refresh()
    })
  }

  function saveEdit(values: CellarSheetValues) {
    setFailed(false)
    startTransition(async () => {
      const result = await editCellarRow(rowKey, values)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setSheetOpen(false)
      router.refresh()
    })
  }

  const secondary =
    'flex min-h-9 items-center rounded-md px-2.5 text-meta text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50'
  const primary =
    'flex min-h-9 items-center gap-1.5 rounded-md border border-ash-300 px-3 text-meta font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-50'

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <div className="flex flex-wrap gap-1.5" aria-busy={isPending || undefined}>
        {isOpen ? (
          <>
            <Link
              href={
                'expressionId' in target
                  ? {
                      pathname: '/bottling/[id]',
                      params: { id: target.expressionId },
                      query: { rate: '1' },
                    }
                  : {
                      pathname: '/sake/[brandId]',
                      params: { brandId: String(target.brandId) },
                      query: { rate: '1' },
                    }
              }
              className={primary}
              data-testid={`cellar-pour-${rowKey}`}
            >
              <Star size={14} aria-hidden="true" />
              {t('pourAndRate')}
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(finishCellarBottle)}
              className={secondary}
              data-testid={`cellar-finish-${rowKey}`}
            >
              {t('finished')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(openCellarBottle)}
              className={primary}
              data-testid={`cellar-open-${rowKey}`}
            >
              <LockSimpleOpen size={14} aria-hidden="true" />
              {t('openBottle')}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(removeFromCellar)}
              className={secondary}
              data-testid={`cellar-remove-${rowKey}`}
            >
              {count > 1 ? t('removeOne') : t('remove')}
            </button>
          </>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setFailed(false)
            setSheetOpen(true)
          }}
          className={secondary}
          data-testid={`cellar-edit-${rowKey}`}
        >
          {t('edit')}
        </button>
      </div>
      {sheetOpen && (
        <CellarSheet
          open
          onOpenChange={setSheetOpen}
          mode="edit"
          name={name}
          initial={{ count, sizeMl, nama }}
          pending={isPending}
          failed={failed}
          onSubmit={saveEdit}
        />
      )}
      {failed && !sheetOpen && (
        <p role="alert" className="text-meta text-ginshu-700">
          {t('error')}
        </p>
      )}
    </div>
  )
}
