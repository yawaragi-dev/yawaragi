'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import {
  clearDebugEvents,
  getDebugEvents,
  getDebugEventsServerSnapshot,
  subscribeToDebugEvents,
} from '@/lib/debug/debug-store'
import { DebugPanel } from './debug-panel'

/**
 * App-level mount for the debug overlay. Lives in the root layout so
 * the panel persists across page navigations within a tab — once
 * activated, it stays visible until the operator hits `?debug=0` or
 * closes the tab. Event state is sourced from the app-level
 * `debug-store`, which is backed by `sessionStorage` so a page reload
 * also keeps the panel populated.
 *
 * The `debugMode` prop is server-rendered from the `yawaragi_debug`
 * cookie (HttpOnly, not readable from client JS). When the cookie
 * isn't set the component renders nothing — zero overhead for the
 * 99.99% case.
 */
export function DebugPanelMount({ debugMode }: { debugMode: boolean }) {
  const t = useTranslations('debug.panel')
  // `useSyncExternalStore` is React's blessed pattern for subscribing
  // to a module-level event source. The store's cached snapshot
  // returns the same array reference between mutations, so React only
  // re-renders when events actually change.
  const events = useSyncExternalStore(
    subscribeToDebugEvents,
    getDebugEvents,
    getDebugEventsServerSnapshot,
  )

  if (!debugMode) return null

  return (
    <DebugPanel
      events={events}
      title={t('title')}
      emptyHint={t('emptyHint')}
      closeLabel={t('closeLabel')}
      clearLabel={t('clearLabel')}
      onClear={clearDebugEvents}
    />
  )
}
