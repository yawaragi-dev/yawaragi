import { describe, expect, it } from 'vitest'
import {
  DebugLog,
  debugAdd,
  getCurrentDebugLog,
  runWithDebugLog,
} from './debug-log'

describe('DebugLog', () => {
  it('appends events in order with relative timestamps', async () => {
    const log = new DebugLog()
    log.add('Vision', 'first event', { brand: 'Dassai' })
    await new Promise((r) => setTimeout(r, 5))
    log.add('Sakenowa', 'second event')

    const events = log.toArray()
    expect(events).toHaveLength(2)
    expect(events[0].source).toBe('Vision')
    expect(events[0].message).toBe('first event')
    expect(events[0].data).toEqual({ brand: 'Dassai' })
    expect(events[0].level).toBe('info')
    expect(events[1].source).toBe('Sakenowa')
    // Second event's relative timestamp must be after the first.
    expect(events[1].tMs).toBeGreaterThanOrEqual(events[0].tMs)
  })

  it('supports warn and error levels via dedicated helpers', () => {
    const log = new DebugLog()
    log.warn('Vision', 'looks shaky', { confidence: 0.4 })
    log.error('Sakenowa', 'no match', { name_ja: '獺祭' })

    const events = log.toArray()
    expect(events[0].level).toBe('warn')
    expect(events[1].level).toBe('error')
  })

  it('returns a defensive copy from toArray (caller cannot mutate internal state)', () => {
    const log = new DebugLog()
    log.add('Vision', 'one')
    const snapshot = log.toArray() as unknown as { length: number; pop: () => unknown }
    snapshot.pop()
    expect(log.toArray()).toHaveLength(1)
  })
})

describe('runWithDebugLog / getCurrentDebugLog / debugAdd', () => {
  it('makes the log available to nested async work via AsyncLocalStorage', async () => {
    const log = new DebugLog()
    await runWithDebugLog(log, async () => {
      // Direct read inside the scope.
      expect(getCurrentDebugLog()).toBe(log)
      // Async boundary: still in scope.
      await Promise.resolve()
      debugAdd('Vision', 'deep in the stack', { ok: true })
    })

    const events = log.toArray()
    expect(events).toHaveLength(1)
    expect(events[0].source).toBe('Vision')
    expect(events[0].message).toBe('deep in the stack')
  })

  it('debugAdd is a no-op outside a runWithDebugLog scope (debug off path)', () => {
    expect(getCurrentDebugLog()).toBeUndefined()
    expect(() => debugAdd('Vision', 'should be silently dropped')).not.toThrow()
  })

  it('passing undefined to runWithDebugLog disables the in-scope reads', async () => {
    await runWithDebugLog(undefined, async () => {
      expect(getCurrentDebugLog()).toBeUndefined()
      // No throw, no side-effect — debug-off path.
      debugAdd('Vision', 'dropped')
    })
  })

  it('isolates concurrent runs (no cross-contamination)', async () => {
    const logA = new DebugLog()
    const logB = new DebugLog()

    await Promise.all([
      runWithDebugLog(logA, async () => {
        await new Promise((r) => setTimeout(r, 5))
        debugAdd('Vision', 'event in A')
      }),
      runWithDebugLog(logB, async () => {
        await new Promise((r) => setTimeout(r, 3))
        debugAdd('Sakenowa', 'event in B')
      }),
    ])

    expect(logA.toArray()).toHaveLength(1)
    expect(logA.toArray()[0].source).toBe('Vision')
    expect(logB.toArray()).toHaveLength(1)
    expect(logB.toArray()[0].source).toBe('Sakenowa')
  })
})
