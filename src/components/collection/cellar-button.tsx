'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Stack, StackPlus } from '@phosphor-icons/react/dist/ssr'
import { ViewNotice } from '@/components/journal/undo-notice'
import { addToCellar } from '@/lib/collection/cellar-actions'
import { cn } from '@/lib/utils'

const NOTICE_MS = 3400

/**
 * §5 / §9's "Add to cellar" — and, once there is a bottle, "In cellar · 2" in
 * the accent, with the filled stack. Each tap adds one more bottle (the
 * prototype's behaviour); the count goes down from the Cellar list, where the
 * bottles are.
 *
 * Shows §11's notice, "Added to your cellar" / "Another bottle added · 2 in
 * cellar", with View → the Cellar segment.
 */
export function CellarButton({
  brandId,
  initialCount,
  refreshOnSave = true,
}: {
  brandId: number
  /** Bottles of this sake already in the cellar; 0 when none. */
  initialCount: number
  /** Re-render the page after adding (off on /scan, where nothing reads the cellar). */
  refreshOnSave?: boolean
}) {
  const t = useTranslations('cellar')
  const router = useRouter()
  const [count, setCount] = useState(initialCount)
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function add() {
    setFailed(false)
    startTransition(async () => {
      const result = await addToCellar(brandId)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setCount(result.count)
      setNotice(result.count > 1 ? t('addedAnother', { count: result.count }) : t('added'))
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setNotice(null), NOTICE_MS)
      if (refreshOnSave) router.refresh()
    })
  }

  const inCellar = count > 0
  const Icon = inCellar ? Stack : StackPlus

  return (
    <div className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={add}
        disabled={isPending}
        aria-busy={isPending || undefined}
        className={cn(
          'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 px-4 text-subtle font-medium transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
          inCellar ? 'text-ginshu-700' : 'text-ink',
        )}
        data-testid="cellar-add"
      >
        <Icon size={17} weight={inCellar ? 'fill' : 'regular'} aria-hidden="true" />
        {inCellar ? t('inCellar', { count }) : t('add')}
      </button>
      {failed && (
        <p role="alert" className="text-meta text-ginshu-700" data-testid="cellar-add-error">
          {t('error')}
        </p>
      )}
      {notice && (
        <ViewNotice
          message={notice}
          viewLabel={t('view')}
          href={{ pathname: '/collection', query: { tab: 'cellar' } }}
        />
      )}
    </div>
  )
}
