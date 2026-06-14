'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { DebugEvent, DebugEventSource } from '@/lib/debug/debug-log'

/**
 * Returns `false` during SSR + the first client render, `true` on
 * every subsequent render. The standard React-blessed pattern for
 * gating client-only state on the *server*'s initial paint so that
 * server and client agree at hydration time.
 */
function useHasHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
}

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
  /** Copy-button accessible label. */
  copyLabel: string
  /** Copy-button feedback label shown briefly after a successful copy. */
  copiedLabel: string
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

/**
 * Serialises the events as plain text in the shape the operator
 * tends to paste back into chat with us — one event per block,
 * timestamp / source / message / optional JSON each on their own
 * line. Matches the layout the panel itself renders so a "copy and
 * paste the trace" workflow stays one tap, not a manual rewrite.
 */
function formatEventsAsPlainText(events: ReadonlyArray<DebugEvent>): string {
  return events
    .map((event) => {
      const lines = [
        `+${(event.tMs / 1000).toFixed(2)}s`,
        event.source,
        `${LEVEL_PREFIX[event.level]}${event.message}`,
      ]
      if (event.data) lines.push(JSON.stringify(event.data))
      return lines.join('\n')
    })
    .join('\n')
}

/**
 * Tailwind's `md` breakpoint = 768px. We treat anything below that as
 * mobile (the bottom-strip layout that needs body-padding compensation
 * so it doesn't overlay content). Anything at-or-above = desktop (the
 * right-rail layout, which can't overlay since it occupies its own
 * column).
 */
const MOBILE_QUERY = '(max-width: 767.98px)'

export function DebugPanel({
  events,
  title,
  emptyHint,
  closeLabel,
  clearLabel,
  copyLabel,
  copiedLabel,
  onClear,
}: DebugPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  // Briefly swaps the button copy from "Copy" → "Copied" after a
  // successful clipboard write so the operator gets feedback even on
  // mobile (no hover-state confirmation available).
  const [justCopied, setJustCopied] = useState(false)
  // Hydration gate for the Copy button's `disabled` attribute —
  // see the comment on the button below for why.
  const hasHydrated = useHasHydrated()

  async function onCopy() {
    if (events.length === 0) return
    try {
      await navigator.clipboard.writeText(formatEventsAsPlainText(events))
      setJustCopied(true)
      setTimeout(() => setJustCopied(false), 1500)
    } catch {
      // Clipboard API can refuse in insecure contexts, in iframes
      // without permission, or when the visitor denies the
      // permission prompt. Silent no-op — the button stays "Copy"
      // and the operator picks the event text manually.
    }
  }

  useEffect(() => {
    // Stick to the latest event when the list grows.
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events.length])

  // Publish `--debug-panel-h` on mobile so the layout can reserve
  // bottom padding equal to the panel's height — the "sticky footer"
  // shape: panel still pinned to bottom-of-viewport, but content
  // above doesn't get covered by it. On desktop the panel is a right
  // rail (separate horizontal column) and never overlays the content,
  // so the variable is cleared and the body padding collapses to 0.
  // ResizeObserver keeps the value live across the panel filling with
  // events; matchMedia keeps it correct across orientation changes.
  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof window === 'undefined') return
    const mql = window.matchMedia(MOBILE_QUERY)

    const update = () => {
      if (mql.matches) {
        document.documentElement.style.setProperty('--debug-panel-h', `${el.offsetHeight}px`)
      } else {
        document.documentElement.style.removeProperty('--debug-panel-h')
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    mql.addEventListener('change', update)

    return () => {
      observer.disconnect()
      mql.removeEventListener('change', update)
      document.documentElement.style.removeProperty('--debug-panel-h')
    }
  }, [])

  return (
    <aside
      ref={panelRef}
      data-testid="debug-panel"
      // Layout — mobile-first then desktop:
      //   Mobile (< md): full-width strip pinned to the bottom, capped
      //     at max-w-2xl and centred. Bottom edge stacks above the
      //     cookie banner via `--cookie-banner-h`.
      //   Desktop (md+): right-side rail running the full viewport
      //     height from `top-0` down to the cookie-banner offset.
      //     Width capped at w-96 so the page reading region behind it
      //     stays usable. The `md:flex md:flex-col` lets the header
      //     stay a natural-height child while the events list flexes
      //     to fill the remaining height.
      className="fixed z-50 mx-auto max-w-2xl overflow-hidden border-t border-zinc-300 bg-zinc-50/95 backdrop-blur inset-x-0 dark:border-zinc-700 dark:bg-zinc-950/95 md:inset-x-auto md:right-0 md:top-0 md:mx-0 md:w-96 md:max-w-none md:border-l md:border-t-0 md:flex md:flex-col"
      // `bottom` is driven by a CSS custom property the cookie banner
      // publishes (see `cookie-banner.tsx`). When the banner is open,
      // the variable equals the banner's rendered height so the debug
      // panel stacks above it; when the banner is closed (or never
      // mounted) the fallback `0px` parks the panel at the screen edge.
      // Applies on both mobile (panel rises from above the banner) and
      // desktop (panel's bottom edge stops at the banner top), so the
      // banner is never occluded.
      style={{ bottom: 'var(--cookie-banner-h, 0px)' }}
      // The panel is not interactive beyond the close button; aria-label
      // gives screen readers a way to skip it.
      aria-label={title}
    >
      <header className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-800">
        {/*
          Title is hidden on the narrowest viewports because every
          pixel of horizontal real estate competes with the action
          buttons. `aria-label` on the <aside> already names the
          region for screen readers, so visually hiding it on
          small screens is a pure layout win.
          `min-w-0` + `truncate` lets the title shrink and ellipse
          on wider mobile if needed instead of forcing the header to
          overflow.
        */}
        <span className="hidden min-w-0 truncate sm:inline">{title}</span>
        <div className="ml-auto flex items-center gap-1">
          {/*
            `disabled` depends on `events.length`, which comes from
            `useSyncExternalStore` reading sessionStorage on the
            client — different from the server's empty snapshot.
            Without gating, the server renders `disabled` based on
            an empty array while the client computes it against
            actual sessionStorage events, causing a real hydration
            mismatch.
            Gate via `hasHydrated`: it's false on first render
            (matches server's `disabled={false}`) and flips true on
            the very next effect. Both server and the first client
            render agree, and the disabled state catches up
            immediately after hydration completes. The onClick guard
            still short-circuits empty events, so the brief
            pre-effect enabled state is harmless.
          */}
          <button
            type="button"
            onClick={onCopy}
            disabled={hasHydrated && events.length === 0}
            aria-label={copyLabel}
            className="inline-flex h-6 items-center justify-center rounded px-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            data-testid="debug-panel-copy"
          >
            {justCopied ? copiedLabel : copyLabel}
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label={clearLabel}
            className="inline-flex h-6 items-center justify-center rounded px-1.5 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
        // Mobile cap (35vh) prevents the strip from eating most of the
        // screen. On desktop the rail fills its parent (`md:flex-1`)
        // and the cap is lifted so long traces are scrollable across
        // the full height.
        //
        // `overflow-x-hidden` is load-bearing: without it the
        // browser computes `overflow-x: auto` (per CSS spec, since
        // `overflow-y` is non-visible). Long unwrapped JSON content
        // (kanji-array variant lists) then expanded the container
        // horizontally inside its own scroll context, which
        // visually overshot the panel even with the parent's
        // `overflow-hidden`.
        className="max-h-[35vh] overflow-x-hidden overflow-y-auto px-3 py-2 text-xs leading-relaxed md:max-h-none md:flex-1"
      >
        {events.length === 0 ? (
          <p className="text-zinc-500 italic">{emptyHint}</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {events.map((event, i) => (
              // Each event is a vertical card: a compact pill row
              // (timestamp + source) on top, then the message + any
              // JSON payload at full panel width below. Previously
              // these three lived in a single horizontal flex row,
              // which ate ~140px of the panel's width on the left
              // and forced JSON to wrap into very tall, narrow
              // columns — and on the narrowest viewports an
              // unbreakable URL inside the JSON would still poke
              // past the panel edge. Stacking gives the message its
              // full width back so wraps are shallow and the panel
              // never has to grow to accommodate a long token.
              //
              // `min-w-0` on the card itself lets it shrink inside
              // the flex-col `<ul>`; without it Chrome occasionally
              // uses an unbreakable child's intrinsic min-content
              // width as the card's min-width.
              <li key={i} className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="shrink-0 tabular-nums text-zinc-500">
                    +{(event.tMs / 1000).toFixed(2)}s
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-medium uppercase tracking-wide ${SOURCE_COLORS[event.source]}`}
                  >
                    {event.source}
                  </span>
                </div>
                <div className="min-w-0 overflow-hidden wrap-anywhere break-all text-zinc-800 dark:text-zinc-200">
                  {/*
                    `break-all` (word-break: break-all) plus
                    `wrap-anywhere` is the same belt-and-braces pair
                    the code block below uses. `wrap-anywhere` alone
                    only breaks when overflow is detected, and the
                    Sakenowa first-pass log inlines pipe-separated
                    kanji variant lists ("柴田屋酒店|柴田屋酒店酒造場|…")
                    which some browsers treat as one unbreakable word
                    — they overflow before the line-break algorithm
                    decides to step in. `break-all` allows the break
                    between any two characters and ends the panel-
                    too-wide regressions on those messages.
                  */}
                  {LEVEL_PREFIX[event.level]}
                  {event.message}
                  {event.data && (
                    // `wrap-anywhere` (Tailwind v4 → `overflow-wrap:
                    // anywhere`) is the most aggressive line-break
                    // policy: it accounts for breaking inside
                    // unbreakable strings to prevent overflow. Pairs
                    // with `break-all` for double-belt coverage on
                    // long ASCII-only segments inside the JSON
                    // (`breweryVariants`, `cookieKey`, `nameJa`, etc).
                    <code className="mt-0.5 block max-w-full overflow-hidden whitespace-pre-wrap wrap-anywhere break-all rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {JSON.stringify(event.data)}
                    </code>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
