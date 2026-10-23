'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { HourglassMedium, WifiSlash } from '@phosphor-icons/react/dist/ssr'
import { inAppDestination } from '@/lib/navigation/in-app-destination'
import { hasOfflineCopyMarker } from '@/lib/offline/collection-copy'
import { OPEN_OFFLINE_COLLECTION, OPEN_OFFLINE_ENTRY } from '@/components/offline/offline-collection'

/** Rule 16's timings (design v1.9, S1 and S4). */
const BAR_AFTER_MS = 300
const SLOW_AFTER_MS = 5_000
/** How long "No connection" stays after a tap that cannot go anywhere. */
const OFFLINE_NOTICE_MS = 4_000

/**
 * Design v1.9, rule 16: a tap on a link to another screen is answered at
 * once and the answer is held — the link keeps its press state
 * (`data-pressed`, styled in globals.css) until the screen arrives; after
 * 300 ms a 2px accent bar runs along the top; after 5 s a floating notice
 * says "Taking longer than usual" with Cancel, which leaves the visitor where
 * they were.
 *
 * One listener for the whole app rather than a hook in every `<Link>`: it
 * sees every link a visitor can tap, including ones in server components.
 * The screen has "arrived" when the path or query changes. Cancel navigates
 * to the screen already open, which supersedes the pending move (the router
 * honours the latest navigation).
 */
export function NavigationFeedback({
  slowTitle,
  slowBody,
  cancel,
  offlineTitle,
  offlineBody,
}: {
  slowTitle: string
  slowBody: string
  cancel: string
  offlineTitle: string
  offlineBody: string
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  // The wait belongs to the screen it started on, so it never shows over
  // the screen it led to, even for the one render before the reset below.
  const [wait, setWait] = useState<{ from: string; phase: 'pressed' | 'bar' | 'slow' } | null>(null)
  /** "No connection" after a tap that cannot go anywhere offline; hides by itself. */
  const [offlineTap, setOfflineTap] = useState(0)
  const offlineTimer = useRef<number | undefined>(undefined)
  const showOffline = () => {
    setOfflineTap((n) => n + 1)
    window.clearTimeout(offlineTimer.current)
    offlineTimer.current = window.setTimeout(() => setOfflineTap(0), OFFLINE_NOTICE_MS)
  }
  const pressed = useRef<Element | null>(null)
  const timers = useRef<number[]>([])
  const here = `${pathname}?${searchParams.toString()}`
  const phase = wait && wait.from === here ? wait.phase : 'idle'

  const clearPress = () => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
    pressed.current?.removeAttribute('data-pressed')
    pressed.current = null
  }
  const settle = () => {
    clearPress()
    setWait(null)
  }

  // Arrived: the address changed, so the press, its timers and the wait go.
  // The reset is keyed to an external event (the router moving), not derived
  // from props: without it, coming back to the address a wait started on
  // (Back, after the screen arrived) would bring the stale notice back.
  useEffect(() => {
    clearPress()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setWait(null)
  }, [here])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const destination = inAppDestination(
        { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') },
        event,
        window.location.href,
      )
      if (!destination) return
      // With the phone offline the next screen cannot load: Next's router
      // would fall back to a full page load, which the service worker answers
      // with its static offline page — and the app shell (tab bar, header,
      // the screen the visitor was on) is gone. Stay instead, and say why
      // (rule 16: nothing ends on an error page because of the network).
      if (!navigator.onLine) {
        event.preventDefault()
        event.stopImmediatePropagation()
        // Design v1.9 Z: what the saved copy can answer, it answers in place —
        // a journal row its sheet, Collection itself the copy. Anything else
        // says there is no connection.
        const row = anchor.closest('[data-offline-entry]')?.getAttribute('data-offline-entry')
        const to = new URL(destination, window.location.origin)
        if (hasOfflineCopyMarker() && row) {
          window.dispatchEvent(new CustomEvent(OPEN_OFFLINE_ENTRY, { detail: { id: row } }))
        } else if (hasOfflineCopyMarker() && /^\/[a-z]{2}\/collection$/.test(to.pathname)) {
          window.dispatchEvent(new CustomEvent(OPEN_OFFLINE_COLLECTION, { detail: { tab: to.searchParams.get('tab') } }))
        } else {
          showOffline()
        }
        return
      }
      clearPress()
      const from = `${window.location.pathname}?${new URLSearchParams(window.location.search).toString()}`
      anchor.setAttribute('data-pressed', '')
      pressed.current = anchor
      setWait({ from, phase: 'pressed' })
      timers.current.push(
        window.setTimeout(() => setWait((w) => (w && w.from === from ? { from, phase: 'bar' } : w)), BAR_AFTER_MS),
        window.setTimeout(() => setWait((w) => (w && w.from === from ? { from, phase: 'slow' } : w)), SLOW_AFTER_MS),
      )
    }
    // Capture phase: Next's `<Link>` calls `preventDefault` on every click it
    // turns into a client navigation, so by the bubble phase every in-app
    // tap looks cancelled. A click something cancelled before it reaches the
    // link is still skipped.
    // A GET form (§8's search, the journal's search) is a page load too.
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement | null
      if (navigator.onLine || !form || form.method.toLowerCase() !== 'get') return
      event.preventDefault()
      event.stopImmediatePropagation()
      showOffline()
    }
    document.addEventListener('click', onClick, { capture: true })
    document.addEventListener('submit', onSubmit, { capture: true })
    // Says the listener is in place: before hydration a tap is a plain page
    // load, which the browser answers itself. E2E waits on it.
    document.documentElement.dataset.navFeedback = 'ready'
    return () => {
      document.removeEventListener('click', onClick, { capture: true })
      document.removeEventListener('submit', onSubmit, { capture: true })
      delete document.documentElement.dataset.navFeedback
    }
  }, [])

  return (
    <>
      {phase !== 'idle' && phase !== 'pressed' && (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden" data-testid="nav-progress">
          <div className="yw-progress-bar h-full w-2/5 bg-ginshu-500" />
        </div>
      )}
      {offlineTap > 0 && (
        <div
          role="status"
          key={offlineTap}
          className="fixed inset-x-[18px] bottom-[calc(var(--tab-bar-h)+12px)] z-40 flex items-center gap-2.5 rounded-md bg-raised px-3.5 py-2.5 shadow-yw-float motion-safe:animate-yw-rise"
          data-testid="nav-offline"
        >
          <WifiSlash size={18} aria-hidden="true" className="shrink-0 text-ash-700" />
          <div className="min-w-0 flex-1">
            <div className="text-subtle text-ink">{offlineTitle}</div>
            <div className="mt-px text-meta text-ash-700">{offlineBody}</div>
          </div>
        </div>
      )}
      {phase === 'slow' && (
        <div
          role="status"
          className="fixed inset-x-[18px] bottom-[calc(var(--tab-bar-h)+12px)] z-40 flex items-center gap-2.5 rounded-md bg-raised py-2.5 pl-3.5 pr-2.5 shadow-yw-float"
          data-testid="nav-slow"
        >
          <HourglassMedium size={18} aria-hidden="true" className="shrink-0 text-ash-700" />
          <div className="min-w-0 flex-1">
            <div className="text-subtle text-ink">{slowTitle}</div>
            <div className="mt-px text-meta text-ash-700">{slowBody}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              settle()
              router.replace(`${window.location.pathname}${window.location.search}`, { scroll: false })
            }}
            className="flex min-h-9 shrink-0 items-center rounded-md px-3 text-meta font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="nav-slow-cancel"
          >
            {cancel}
          </button>
        </div>
      )}
    </>
  )
}
