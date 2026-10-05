'use client'

import { CheckCircle } from '@phosphor-icons/react/dist/ssr'

/**
 * The notice every save shows (rule 1: "Every save shows an Undo notice for
 * about 3s"). §5 draws it as a dark bar floating above the tab bar — never ON
 * the bottom edge, which rule 11 gives to the tabs alone.
 *
 * `role="status"` so the confirmation is announced without stealing focus;
 * the caller owns the timer, because the caller knows what Undo undoes.
 */
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
    <div
      role="status"
      className="fixed inset-x-4 z-30 mx-auto flex max-w-md items-center gap-2.5 rounded-md bg-camera px-3.5 py-3 text-ash-900 shadow-yw-lg motion-safe:animate-yw-rise"
      style={{ bottom: 'calc(var(--tab-bar-h) + 8px)' }}
      data-testid="undo-notice"
    >
      <CheckCircle size={19} weight="fill" className="shrink-0 text-ginshu-600" aria-hidden="true" />
      <span className="flex-1 text-subtle">{message}</span>
      <button
        type="button"
        onClick={onUndo}
        className="min-h-9 rounded-sm px-1 text-meta font-medium text-ginshu-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="undo-notice-undo"
      >
        {undoLabel}
      </button>
    </div>
  )
}
