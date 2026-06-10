'use client'

import type { DebugEvent } from './debug-log'

/**
 * Client-side debug event store. Backed by `sessionStorage` so the
 * `<DebugPanel />` overlay (rendered at layout level — see
 * `src/app/[locale]/layout.tsx`) keeps showing the trace across:
 *
 *   - Page navigations within the same tab (matched-scan redirect to
 *     `/sake/[brandId]`, locale switches, etc.)
 *   - Page reloads (browser refresh while debug is on)
 *   - Closing and re-opening the form on the scan entry route
 *
 * `sessionStorage` (not `localStorage`) is the right scope: the trace
 * is per-tab, expires when the tab closes, and never persists past a
 * sign-off the way `localStorage` would.
 *
 * Subscribers (the panel + future overlays) listen via the
 * `debug-events-changed` window event. The store dispatches it on
 * every mutation; React components convert it into renders via a
 * thin `useSyncExternalStore`-style hook.
 *
 * The store is opt-in: writes are no-ops when the operator has not
 * activated debug mode. The decision lives upstream (cookie + prop on
 * `<DebugPanelMount />`); the store just stores what's pushed at it.
 */

const STORAGE_KEY = 'yawaragi:debug:events'
export const DEBUG_EVENTS_CHANGED = 'debug-events-changed'

// Cached snapshot. Returning the same array reference across reads is
// load-bearing for `useSyncExternalStore`: the consumer compares by
// identity to decide whether to re-render. We mutate this only when
// `appendDebugEvents` / `clearDebugEvents` fires.
let snapshot: ReadonlyArray<DebugEvent> = []
let hydrated = false

function readStorage(): ReadonlyArray<DebugEvent> {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as DebugEvent[]) : []
  } catch {
    // SSR, private-mode quota errors, malformed JSON — fall back to
    // empty and let the next append re-establish the array.
    return []
  }
}

function writeStorage(events: ReadonlyArray<DebugEvent>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  } catch {
    // Quota / private-mode failures — the operator loses persistence
    // across reload but the in-memory listeners still receive the
    // event via the dispatch below, so the panel still updates this
    // tab. Persistence is a debug-quality-of-life feature, not a
    // correctness invariant.
  }
}

function emit(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DEBUG_EVENTS_CHANGED))
}

function hydrateFromStorageOnce(): void {
  if (hydrated) return
  hydrated = true
  snapshot = readStorage()
}

export function getDebugEvents(): ReadonlyArray<DebugEvent> {
  hydrateFromStorageOnce()
  return snapshot
}

/**
 * Append events to the store. Used by `ScanForm` (client-side
 * picked-file / downscale events) and by the same form when a Server
 * Action result carries `state.debugLog` (server-side trace).
 */
export function appendDebugEvents(events: ReadonlyArray<DebugEvent>): void {
  if (events.length === 0) return
  hydrateFromStorageOnce()
  snapshot = [...snapshot, ...events]
  writeStorage(snapshot)
  emit()
}

/** Drop every event. Called by the panel's Clear button. */
export function clearDebugEvents(): void {
  snapshot = []
  hydrated = true
  writeStorage(snapshot)
  emit()
}

/**
 * Subscribe helper for `useSyncExternalStore`. Returns the
 * unsubscribe callback. Safe to call during SSR — returns a no-op.
 */
export function subscribeToDebugEvents(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(DEBUG_EVENTS_CHANGED, callback)
  return () => window.removeEventListener(DEBUG_EVENTS_CHANGED, callback)
}

/**
 * SSR-time snapshot — always empty. The client-side effect re-runs
 * with the real snapshot on hydrate.
 */
const EMPTY_SNAPSHOT: ReadonlyArray<DebugEvent> = []
export function getDebugEventsServerSnapshot(): ReadonlyArray<DebugEvent> {
  return EMPTY_SNAPSHOT
}
