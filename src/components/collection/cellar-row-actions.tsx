'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { LockSimpleOpen, Star } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import {
  finishCellarBottle,
  openCellarBottle,
  removeFromCellar,
} from '@/lib/collection/cellar-actions'

/**
 * A Cellar row's two buttons (§11). Open bottle: "Pour & rate" (to the bottle
 * page with §5's panel already open) · "Finished". Sealed: "Open a bottle" ·
 * "Remove" — one bottle at a time, so it reads "Remove one" while there are
 * several. Each change re-renders the list from the store.
 */
export function CellarRowActions({
  brandId,
  isOpen,
  count,
}: {
  brandId: number
  isOpen: boolean
  /** Bottles on the row. */
  count: number
}) {
  const t = useTranslations('cellar')
  const router = useRouter()
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()

  function run(action: (id: number) => Promise<{ status: string }>) {
    setFailed(false)
    startTransition(async () => {
      const result = await action(brandId)
      if (result.status !== 'ok') setFailed(true)
      else router.refresh()
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
              href={{
                pathname: '/sake/[brandId]',
                params: { brandId: String(brandId) },
                query: { rate: '1' },
              }}
              className={primary}
              data-testid={`cellar-pour-${brandId}`}
            >
              <Star size={14} aria-hidden="true" />
              {t('pourAndRate')}
            </Link>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(finishCellarBottle)}
              className={secondary}
              data-testid={`cellar-finish-${brandId}`}
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
              data-testid={`cellar-open-${brandId}`}
            >
              <LockSimpleOpen size={14} aria-hidden="true" />
              {t('openBottle')}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(removeFromCellar)}
              className={secondary}
              data-testid={`cellar-remove-${brandId}`}
            >
              {count > 1 ? t('removeOne') : t('remove')}
            </button>
          </>
        )}
      </div>
      {failed && (
        <p role="alert" className="text-meta text-ginshu-700">
          {t('error')}
        </p>
      )}
    </div>
  )
}
