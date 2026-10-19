import type { ComponentType } from 'react'
import { CameraPlus } from '@phosphor-icons/react/dist/ssr'

/**
 * The one after-scan nudge (design v1.8, J and R3): a line saying which part
 * of the bottle would tell more, and a button that opens the camera paired
 * with this scan. One line, one button, never more than one on a screen.
 * `note` is the "last free scan" line (J3), shown only when one is left.
 */
export function ScanNudge({
  icon: Icon,
  text,
  action,
  note,
  onAction,
  testId,
}: {
  icon: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean | 'true' }>
  text: string
  action: string
  note: string | null
  onAction: () => void
  testId: string
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-divider p-3.5" data-testid={testId}>
      <div className="flex items-center gap-3">
        <Icon size={18} aria-hidden="true" className="shrink-0 text-ash-600" />
        <p className="min-w-0 flex-1 text-subtle text-ash-800">{text}</p>
        <button
          type="button"
          onClick={onAction}
          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ash-400 px-3 text-meta font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid={`${testId}-action`}
        >
          <CameraPlus size={16} aria-hidden="true" />
          {action}
        </button>
      </div>
      {note && (
        <p className="text-section-label text-ash-700" data-testid={`${testId}-note`}>
          {note}
        </p>
      )}
    </div>
  )
}
