import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DebugEvent } from './debug-log'

// The store caches a module-level snapshot. Each test gets a fresh
// module via `vi.resetModules()` + `import()` so cross-test state
// doesn't leak.

function event(message: string, source: DebugEvent['source'] = 'Vision'): DebugEvent {
  return { tMs: 0, source, level: 'info', message }
}

describe('debug-store', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('returns an empty snapshot when storage is empty', async () => {
    const { getDebugEvents } = await import('./debug-store')
    expect(getDebugEvents()).toEqual([])
  })

  it('appends events and returns them via getDebugEvents', async () => {
    const { appendDebugEvents, getDebugEvents } = await import('./debug-store')
    appendDebugEvents([event('one'), event('two')])
    const events = getDebugEvents()
    expect(events).toHaveLength(2)
    expect(events[0].message).toBe('one')
    expect(events[1].message).toBe('two')
  })

  it('preserves snapshot identity across reads until the next mutation', async () => {
    const { appendDebugEvents, getDebugEvents } = await import('./debug-store')
    appendDebugEvents([event('one')])
    const a = getDebugEvents()
    const b = getDebugEvents()
    expect(a).toBe(b) // same array reference — load-bearing for useSyncExternalStore

    appendDebugEvents([event('two')])
    const c = getDebugEvents()
    expect(c).not.toBe(a) // identity changed on mutation
    expect(c).toHaveLength(2)
  })

  it('persists across module re-imports via sessionStorage', async () => {
    const first = await import('./debug-store')
    first.appendDebugEvents([event('persisted')])

    vi.resetModules()
    const second = await import('./debug-store')
    expect(second.getDebugEvents().map((e) => e.message)).toEqual(['persisted'])
  })

  it('clearDebugEvents wipes the snapshot and storage', async () => {
    const { appendDebugEvents, clearDebugEvents, getDebugEvents } = await import(
      './debug-store'
    )
    appendDebugEvents([event('one'), event('two')])
    clearDebugEvents()
    expect(getDebugEvents()).toEqual([])

    // Survives a fresh import too.
    vi.resetModules()
    const fresh = await import('./debug-store')
    expect(fresh.getDebugEvents()).toEqual([])
  })

  it('emits a debug-events-changed event on append', async () => {
    const { appendDebugEvents, DEBUG_EVENTS_CHANGED } = await import('./debug-store')
    const handler = vi.fn()
    window.addEventListener(DEBUG_EVENTS_CHANGED, handler)
    try {
      appendDebugEvents([event('one')])
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(DEBUG_EVENTS_CHANGED, handler)
    }
  })

  it('emits on clear (so the panel re-renders to the empty state)', async () => {
    const { appendDebugEvents, clearDebugEvents, DEBUG_EVENTS_CHANGED } = await import(
      './debug-store'
    )
    appendDebugEvents([event('one')])
    const handler = vi.fn()
    window.addEventListener(DEBUG_EVENTS_CHANGED, handler)
    try {
      clearDebugEvents()
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(DEBUG_EVENTS_CHANGED, handler)
    }
  })

  it('appendDebugEvents with an empty array is a no-op (no emit)', async () => {
    const { appendDebugEvents, DEBUG_EVENTS_CHANGED } = await import('./debug-store')
    const handler = vi.fn()
    window.addEventListener(DEBUG_EVENTS_CHANGED, handler)
    try {
      appendDebugEvents([])
      expect(handler).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener(DEBUG_EVENTS_CHANGED, handler)
    }
  })

  it('subscribeToDebugEvents returns an unsubscribe that detaches the listener', async () => {
    const { subscribeToDebugEvents, appendDebugEvents } = await import('./debug-store')
    const handler = vi.fn()
    const unsubscribe = subscribeToDebugEvents(handler)
    appendDebugEvents([event('one')])
    expect(handler).toHaveBeenCalledTimes(1)
    unsubscribe()
    appendDebugEvents([event('two')])
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('getDebugEventsServerSnapshot returns the same empty array across calls', async () => {
    const { getDebugEventsServerSnapshot } = await import('./debug-store')
    expect(getDebugEventsServerSnapshot()).toEqual([])
    expect(getDebugEventsServerSnapshot()).toBe(getDebugEventsServerSnapshot())
  })
})
