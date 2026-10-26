'use client'

import { useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DotsThree } from '@phosphor-icons/react/dist/ssr'
import * as actions from '@/lib/collection/bottle-history-actions'
import { reachable } from '@/lib/network/settle-request'

// A lost network answers "unavailable" instead of throwing to the error page.
const forgetBottleHad = reachable(actions.forgetBottleHad)

/** How far left a finger has to drag the row before letting go asks the question. */
const SWIPE_ASKS_PX = 64
/** How far the row follows the finger. */
const SWIPE_MAX_PX = 96
/** Movement under this is a tap, not a drag. */
const DRAG_SLOP_PX = 8

/**
 * One row of "Bottles you've had" (design v1.10, AB6), with its ⋯: "rows are
 * removed one by one (swipe or the row's ⋯, written)". The ⋯ opens an inline
 * question under the row — the bottling page's delete pattern — because
 * the removal is permanent: it takes the bottle out of the history, the kept
 * counts and the export. A swipe to the left asks the same question rather
 * than removing at once — the design draws neither the swipe nor the ⋯, and
 * a removal for good should not hang on a finger slipping. The row follows
 * the finger (touch and pen only; `touch-action: pan-y` leaves vertical
 * scrolling to the browser) and the tap that ends a drag does not open the
 * bottle's page. Client-side for the question's state, the drag and the
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
  const [dragX, setDragX] = useState(0)
  // Where the drag started; null when no drag is being followed.
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  // Set when a drag ends, so the click the browser sends after it is dropped.
  const dragged = useRef(false)
  const question = t('question', { name })

  function ask() {
    setFailed(false)
    setAsking(true)
  }

  function onPointerDown(e: React.PointerEvent) {
    // A drag that ended without a click (touch browsers often send none)
    // must not swallow the next tap.
    dragged.current = false
    if (readOnly || e.pointerType === 'mouse') return
    dragStart.current = { x: e.clientX, y: e.clientY }
  }

  function onPointerMove(e: React.PointerEvent) {
    const start = dragStart.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    // A mostly vertical move is a scroll: stop following this drag.
    if (dragX === 0 && Math.abs(dy) > DRAG_SLOP_PX && Math.abs(dy) > Math.abs(dx)) {
      dragStart.current = null
      return
    }
    setDragX(Math.max(-SWIPE_MAX_PX, Math.min(0, dx)))
  }

  function onPointerUp() {
    if (!dragStart.current) return
    dragStart.current = null
    if (dragX < -DRAG_SLOP_PX) dragged.current = true
    if (dragX <= -SWIPE_ASKS_PX) ask()
    setDragX(0)
  }

  function onPointerCancel() {
    dragStart.current = null
    setDragX(0)
  }

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
      <div
        className="flex touch-pan-y items-center gap-1 motion-safe:transition-transform"
        style={dragX ? { transform: `translateX(${dragX}px)`, transitionDuration: '0ms' } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={(e) => {
          if (!dragged.current) return
          dragged.current = false
          e.preventDefault()
          e.stopPropagation()
        }}
        data-testid="bottles-had-swipe"
      >
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
