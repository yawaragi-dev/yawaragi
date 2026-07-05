'use client'

import { useEffect } from 'react'
import type { DebugEvent } from '@/lib/debug/debug-log'
import { appendDebugEvents } from '@/lib/debug/debug-store'

/**
 * Client bridge — takes a server-collected debug log (from a Server Action
 * or an RSC-invoked action's discriminated-union state) and pushes its
 * events into the client-side `debug-store`, which the `<DebugPanel />`
 * mounted from the root layout subscribes to via `useSyncExternalStore`.
 *
 * Why this shape rather than a client-side form (which is what
 * `scan-form.tsx` uses):
 *   - The suggest surface is RSC end-to-end — the action is called
 *     inline from `<SuggestPage>` during GET render, not from a client
 *     form action. So there's no natural client render context in which
 *     to `useEffect(() => appendDebugEvents(state.debugLog))`.
 *   - This tiny 'use client' island receives the server-serialised
 *     events as props and does the store push on mount. Zero runtime
 *     cost when events is empty (short-circuit).
 *   - The panel dedup pattern from `scan-form.tsx` (`lastServerLogRef`)
 *     isn't needed here — an RSC re-render pipes fresh props through a
 *     fresh component instance, so a mount-time push happens once per
 *     server-side action invocation. If a future refactor puts the
 *     pusher inside a client component that re-renders in the same
 *     tree, add a stable-ref guard mirroring `scan-form.tsx`.
 */
export function DebugLogPusher({
  events,
}: {
  events: ReadonlyArray<DebugEvent> | undefined
}) {
  useEffect(() => {
    if (events === undefined || events.length === 0) return
    appendDebugEvents(events)
  }, [events])

  return null
}
