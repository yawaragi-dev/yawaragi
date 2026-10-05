'use client'

import type { ReactNode } from 'react'
import { CheckCircle } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'

/**
 * The notice a save shows (rule 1: "Every save shows an Undo notice for about
 * 3s"; §11: "Adding anywhere shows a notice … with View"). §5 draws it as a
 * dark bar floating above the tab bar — never ON the bottom edge, which rule
 * 11 gives to the tabs alone.
 *
 * `role="status"` so the confirmation is announced without stealing focus;
 * callers own the timer, because they know what the action undoes or opens.
 */
function NoticeBar({ message, children }: { message: string; children: ReactNode }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 z-30 mx-auto flex max-w-md items-center gap-2.5 rounded-md bg-camera px-3.5 py-3 text-ash-900 shadow-yw-lg motion-safe:animate-yw-rise"
      style={{ bottom: 'calc(var(--tab-bar-h) + 8px)' }}
      data-testid="undo-notice"
    >
      <CheckCircle size={19} weight="fill" className="shrink-0 text-ginshu-600" aria-hidden="true" />
      <span className="flex-1 text-subtle">{message}</span>
      {children}
    </div>
  )
}

const ACTION =
  'flex min-h-9 items-center rounded-sm px-1 text-meta font-medium text-ginshu-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

/** "Logged · palate updated · Undo". */
export function UndoNotice({
  message,
  undoLabel,
  onUndo,
}: {
  message: string
  undoLabel: string
  onUndo: () => void
}) {
  return (
    <NoticeBar message={message}>
      <button type="button" onClick={onUndo} className={ACTION} data-testid="undo-notice-undo">
        {undoLabel}
      </button>
    </NoticeBar>
  )
}

/** "Added to your cellar · View" — the action is a place to go, not an undo. */
export function ViewNotice({
  message,
  viewLabel,
  href,
}: {
  message: string
  viewLabel: string
  href: { pathname: '/collection'; query: Record<string, string> }
}) {
  return (
    <NoticeBar message={message}>
      <Link href={href} className={ACTION} data-testid="notice-view">
        {viewLabel}
      </Link>
    </NoticeBar>
  )
}
