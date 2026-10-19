'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { CaretRight, Plus, Stack, StackPlus } from '@phosphor-icons/react/dist/ssr'
import { CellarSheet } from '@/components/collection/cellar-sheet'
import { ViewNotice } from '@/components/journal/undo-notice'
import { Link } from '@/i18n/navigation'
import * as saves from '@/lib/collection/cellar-actions'
import { reachable } from '@/lib/network/settle-request'
import type { CellarSheetValues, CellarTarget } from '@/lib/schemas/cellar-input'
import { cn } from '@/lib/utils'

// Saves that the network loses answer "unavailable" (Couldn't save) instead
// of throwing to the error page (design question S6).
const addToCellar = reachable(saves.addToCellar)

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
 * **Both buttons open the sheet** (design v1.6.2, decision 2): "Add to
 * cellar" and the "+" ask how many bottles, what size and whether they are
 * nama, and nothing is added until the sheet's own button. The sheet starts
 * on one 720 ml bottle, so the common case is still two taps.
 *
 * Shows §11's notice, "Added to your cellar" / "Another bottle added · 2 in
 * cellar", with View → the Cellar segment.
 */
export function CellarButton({
  target,
  name,
  initialCount,
  alsoCounted = 0,
  refreshOnSave = true,
  resolveTarget,
  initialNama = false,
}: {
  /** The sake, or the bottling, whose page this is: what "+" adds a bottle of. */
  target: CellarTarget
  /** What the bottles are of; the sheet names it under its title. */
  name: string
  /** Bottles of this target already in the cellar, across sizes; 0 when none. */
  initialCount: number
  /** Bottles on other rows that this page counts as well: a sake's page adds
   *  its bottlings' bottles. */
  alsoCounted?: number
  /** Re-render the page after adding (off on /scan, where nothing reads the cellar). */
  refreshOnSave?: boolean
  /**
   * Decides what the bottles are of only when they are added: a scan whose
   * label names a bottling creates it then, not on the way in. `null` is a
   * failure. Without it, bottles go to `target`.
   */
  resolveTarget?: () => Promise<CellarTarget | null>
  /** The sheet's nama switch to start from, e.g. when the label says nama. */
  initialNama?: boolean
}) {
  const t = useTranslations('cellar')
  const router = useRouter()
  const [rowCount, setRowCount] = useState(initialCount)
  const count = rowCount + alsoCounted
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  function add(values: CellarSheetValues) {
    setFailed(false)
    startTransition(async () => {
      const resolved = resolveTarget ? await resolveTarget() : target
      if (!resolved) {
        setFailed(true)
        return
      }
      const result = await addToCellar(resolved, values)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setSheetOpen(false)
      setRowCount(result.count)
      const total = result.count + alsoCounted
      setNotice(
        total === values.count
          ? t('added')
          : values.count === 1
            ? t('addedAnother', { count: total })
            : t('addedMany', { added: values.count, count: total }),
      )
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setNotice(null), NOTICE_MS)
      if (refreshOnSave) router.refresh()
    })
  }

  function openSheet() {
    setFailed(false)
    setSheetOpen(true)
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
            onClick={openSheet}
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
          onClick={openSheet}
          className={cn(control, 'px-4 text-ink')}
          data-testid="cellar-add"
        >
          <StackPlus size={17} aria-hidden="true" />
          {t('add')}
        </button>
      )}
      {/* Mounted only while open, so it starts from the defaults each time. */}
      {sheetOpen && (
        <CellarSheet
          open
          onOpenChange={setSheetOpen}
          mode="add"
          name={name}
          {...(initialNama ? { initial: { count: 1, sizeMl: null, nama: true } } : {})}
          pending={isPending}
          failed={failed}
          onSubmit={add}
        />
      )}
      {notice && <ViewNotice message={notice} viewLabel={t('view')} href={CELLAR_HREF} />}
    </div>
  )
}
