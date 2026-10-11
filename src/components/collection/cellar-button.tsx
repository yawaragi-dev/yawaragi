'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CaretRight, Plus, Stack, StackPlus } from '@phosphor-icons/react/dist/ssr'
import { ViewNotice } from '@/components/journal/undo-notice'
import { Link } from '@/i18n/navigation'
import { addToCellar } from '@/lib/collection/cellar-actions'
import type { CellarTarget } from '@/lib/schemas/cellar-input'
import { cn } from '@/lib/utils'

const NOTICE_MS = 3400
const CELLAR_HREF = { pathname: '/collection', query: { tab: 'cellar' } } as const

/**
 * §5 / §9's "Add to cellar" — and, once there is a bottle, "In cellar · 2" in
 * the accent, with the filled stack.
 *
 * Deviation from the prototype, where every tap on "In cellar · 2" adds one
 * more bottle: "In cellar · 2" reads as a state or a way in, not as "add
 * another", so once owned it is a link to the Cellar, and adding another
 * bottle is its own labelled "+" button beside it. The count goes down from
 * the Cellar list, where the bottles are.
 *
 * The count shown is the page's, not always the row's (design v1.6.1): a
 * sake's page counts its bottlings' bottles too (`alsoCounted`), while "+"
 * adds to the row of the page you are on.
 *
 * Shows §11's notice, "Added to your cellar" / "Another bottle added · 2 in
 * cellar", with View → the Cellar segment.
 */
export function CellarButton({
  target,
  initialCount,
  alsoCounted = 0,
  refreshOnSave = true,
}: {
  /** The sake, or the bottling, whose page this is: what "+" adds a bottle of. */
  target: CellarTarget
  /** Bottles already on this target's own row; 0 when none. */
  initialCount: number
  /** Bottles on other rows that this page counts as well: a sake's page adds
   *  its bottlings' bottles. */
  alsoCounted?: number
  /** Re-render the page after adding (off on /scan, where nothing reads the cellar). */
  refreshOnSave?: boolean
}) {
  const t = useTranslations('cellar')
  const router = useRouter()
  const [rowCount, setRowCount] = useState(initialCount)
  const count = rowCount + alsoCounted
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function add() {
    setFailed(false)
    startTransition(async () => {
      const result = await addToCellar(target)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setRowCount(result.count)
      const total = result.count + alsoCounted
      setNotice(total > 1 ? t('addedAnother', { count: total }) : t('added'))
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setNotice(null), NOTICE_MS)
      if (refreshOnSave) router.refresh()
    })
  }

  const inCellar = count > 0
  const control =
    'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 text-subtle font-medium transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

  return (
    <div className="flex flex-1 flex-col gap-1">
      {inCellar ? (
        <div className="flex gap-2">
          <Link
            href={CELLAR_HREF}
            className={cn(control, 'flex-1 px-4 text-ginshu-700')}
            data-testid="cellar-view"
          >
            <Stack size={17} weight="fill" aria-hidden="true" />
            {t('inCellar', { count })}
            <CaretRight size={14} aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={add}
            disabled={isPending}
            aria-busy={isPending || undefined}
            aria-label={t('addAnother')}
            title={t('addAnother')}
            className={cn(control, 'w-11 shrink-0 text-ink')}
            data-testid="cellar-add"
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={add}
          disabled={isPending}
          aria-busy={isPending || undefined}
          className={cn(control, 'px-4 text-ink')}
          data-testid="cellar-add"
        >
          <StackPlus size={17} aria-hidden="true" />
          {t('add')}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-meta text-ginshu-700" data-testid="cellar-add-error">
          {t('error')}
        </p>
      )}
      {notice && <ViewNotice message={notice} viewLabel={t('view')} href={CELLAR_HREF} />}
    </div>
  )
}
