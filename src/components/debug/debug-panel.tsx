'use client'

import { useEffect, useRef } from 'react'
import type { DebugEvent, DebugEventSource } from '@/lib/debug/debug-log'

/**
 * Per-request debug overlay. Renders the trace events collected by the
 * server-side `DebugLog` (vision, rate-limit, Sakenowa) alongside any
 * client-side events the originating component appends (file picked,
 * downscale done, submitting...). Activated by `?debug=1` (sets cookie);
 * deactivated by `?debug=0` (clears cookie).
 *
 * Style:
 *   - Fixed to the bottom of the viewport. Mobile-first; on a narrow
 *     screen it takes the full width and roughly the lower third of the
 *     viewport. On wider screens it stays bottom-anchored but caps at
 *     `max-w-2xl` centred.
 *   - Auto-scrolls to the latest event on append so the operator sees
 *     the freshest output without scrolling.
 *
 * What this is NOT:
 *   - Not a production observability surface. The panel exposes raw
 *     extraction values and query shapes — fine in single-maintainer
 *     debugging, not appropriate for arbitrary visitors. The cookie
 *     activation is opt-in by URL param; a future gating slice can add
 *     a bearer-token check before serving the cookie.
 */
export interface DebugPanelProps {
  events: ReadonlyArray<DebugEvent>
  /** Header copy. Comes from next-intl in the consumer; this component is locale-agnostic. */
  title: string
  /** Empty-state copy when there are zero events yet. */
  emptyHint: string
  /** Close-button accessible label. */
  closeLabel: string
  /** Clear-button accessible label. */
  clearLabel: string
  /** Handler for the Clear button — wipes the persisted event store. */
  onClear: () => void
}

const SOURCE_COLORS: Record<DebugEventSource, string> = {
  ScanForm: 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  ScanAction: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100',
  RateLimit: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  Vision: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  Sakenowa: 'bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-100',
}

const LEVEL_PREFIX = {
  info: '',
  warn: '⚠ ',
  error: '✗ ',
} as const

export function DebugPanel({
  events,
  title,
  emptyHint,
  closeLabel,
  clearLabel,
  onClear,
}: DebugPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // Stick to the latest event when the list grows.
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  return (
    <aside
      data-testid="debug-panel"
      className="fixed inset-x-0 z-50 mx-auto max-w-2xl border-t border-zinc-300 bg-zinc-50/95 backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95"
      // `bottom` is driven by a CSS custom property the cookie banner
      // publishes (see `cookie-banner.tsx`). When the banner is open,
      // the variable equals the banner's rendered height so the debug
      // panel stacks above it; when the banner is closed (or never
      // mounted) the fallback `0px` parks the panel at the screen edge.
      // ResizeObserver in the banner keeps the value live across locale
      // copy length, customize-toggle, and viewport-width changes.
      style={{ bottom: 'var(--cookie-banner-h, 0px)' }}
      // The panel is not interactive beyond the close button; aria-label
      // gives screen readers a way to skip it.
      aria-label={title}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-800">
        <span>{title}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="inline-flex h-6 items-center justify-center rounded px-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            data-testid="debug-panel-clear"
          >
            {clearLabel}
          </button>
          <a
            // `?debug=0` triggers the proxy's deactivation branch — clear
            // cookie, redirect to the same URL minus the param. Storage
            // is cleared on the next mount when `debugMode` flips false
            // → unmount → next activation starts fresh.
            href="?debug=0"
            aria-label={closeLabel}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            data-testid="debug-panel-close"
          >
            ×
          </a>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="max-h-[35vh] overflow-y-auto px-3 py-2 text-xs leading-relaxed"
      >
        {events.length === 0 ? (
          <p className="text-zinc-500 italic">{emptyHint}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {events.map((event, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="min-w-[3.25rem] tabular-nums text-zinc-500">
                  +{(event.tMs / 1000).toFixed(2)}s
                </span>
                <span
                  className={`min-w-[5.25rem] rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SOURCE_COLORS[event.source]}`}
                >
                  {event.source}
                </span>
                <span className="flex-1 break-words text-zinc-800 dark:text-zinc-200">
                  {LEVEL_PREFIX[event.level]}
                  {event.message}
                  {event.data && (
                    <code className="mt-0.5 block whitespace-pre-wrap break-all rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {JSON.stringify(event.data)}
                    </code>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
