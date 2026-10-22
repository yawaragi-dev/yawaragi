'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { WifiHigh, WifiSlash } from '@phosphor-icons/react/dist/ssr'

const BACK_ONLINE_MS = 2_400

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export interface OfflineLineMessages {
  /** "Offline · Saving and scanning need a connection." */
  offline: string
  backOnline: string
  /** "Offline · Your journal as of {time}" — Collection's Journal segment (Z1). */
  journalAsOf: string
  /** "Offline · Your cellar as of {time}" */
  cellarAsOf: string
  /** "Offline · Recent tastings as of {time}" — Home (Z4). */
  homeAsOf: string
  /** "Changes wait for a connection." */
  changesWait: string
}

/**
 * Design v1.9, S3 and Z1: one line under the top edge while the phone says it
 * is offline — above the sample strip, never at the bottom, which belongs to
 * the cookie banner and the tab bar. Collection and Home say what they show
 * instead ("Your journal as of 14:02"), the time being when the screen was
 * last loaded with a connection. When the phone is back, "Back online" for
 * 2.4 s, then nothing. The phone can say "offline" reliably but not "online"
 * (a dead signal still reports a connection), so the line only ever claims
 * what `navigator.onLine` says.
 */
export function OfflineLine({
  messages,
  locale,
  hasCollection,
}: {
  messages: OfflineLineMessages
  locale: string
  /** Whether this visitor has a journal to show (Z1, Z4); else the general line. */
  hasCollection: boolean
}) {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  const pathname = usePathname()
  const tab = useSearchParams().get('tab')
  const [shown, setShown] = useState<{ kind: 'offline' | 'back'; asOf: number } | null>(null)
  const loadedAt = useRef<number>(0)

  // When this screen was last shown with a connection: "as of" on Z1's line.
  useEffect(() => {
    if (navigator.onLine) loadedAt.current = Date.now()
  }, [pathname, tab])

  useEffect(() => {
    if (!online) {
      setShown({ kind: 'offline', asOf: loadedAt.current || Date.now() })
      return
    }
    setShown((was) => (was?.kind === 'offline' ? { ...was, kind: 'back' } : was))
    const id = window.setTimeout(() => setShown((was) => (was?.kind === 'back' ? null : was)), BACK_ONLINE_MS)
    return () => window.clearTimeout(id)
  }, [online])

  if (shown === null) return null

  const screen = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '')
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(shown.asOf)
  let text = messages.offline
  let sub: string | null = null
  if (hasCollection && screen === '/collection') {
    text = (tab === 'cellar' ? messages.cellarAsOf : messages.journalAsOf).replace('{time}', time)
    sub = messages.changesWait
  } else if (hasCollection && screen === '/home') {
    text = messages.homeAsOf.replace('{time}', time)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-9 flex-none items-center gap-2.5 bg-ash-200 px-4 py-1.5 shadow-[0_1px_0_var(--color-divider)]"
      data-testid="offline-line"
    >
      {shown.kind === 'offline' ? (
        <WifiSlash size={16} aria-hidden="true" className="shrink-0 text-ash-700" />
      ) : (
        <WifiHigh size={16} aria-hidden="true" className="shrink-0 text-ash-700" />
      )}
      <p className="min-w-0 flex-1 text-meta text-ink">
        {shown.kind === 'offline' ? text : messages.backOnline}
        {shown.kind === 'offline' && sub && <span className="text-ash-700"> · {sub}</span>}
      </p>
    </div>
  )
}
