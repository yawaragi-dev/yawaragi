import { afterEach, describe, expect, it, vi } from 'vitest'
import { reachable, settleRequest } from './settle-request'

const online = () => true
const offline = () => false

describe('settleRequest', () => {
  it('stops waiting when the visitor cancels, as if it had timed out', async () => {
    let cancel!: () => void
    const cancelled = new Promise<void>((resolve) => (cancel = resolve))
    const never = new Promise<number>(() => {})
    const settled = settleRequest(never, { timeoutMs: null, isOnline: () => true, cancelled })
    cancel()
    await expect(settled).resolves.toEqual({ ok: false, failure: 'timed_out' })
  })

  afterEach(() => vi.useRealTimers())

  it('hands back the answer when the request arrives', async () => {
    await expect(settleRequest(Promise.resolve(42), { timeoutMs: 1000, isOnline: online })).resolves.toEqual({
      ok: true,
      value: 42,
    })
  })

  it('calls a request the browser could not send "offline"', async () => {
    const sent = Promise.reject(new TypeError('NetworkError when attempting to fetch resource.'))
    await expect(settleRequest(sent, { timeoutMs: 1000, isOnline: online })).resolves.toEqual({
      ok: false,
      failure: 'offline',
    })
  })

  it('calls any failure "offline" while the phone says it has no connection', async () => {
    const sent = Promise.reject(new Error('An unexpected response was received from the server.'))
    await expect(settleRequest(sent, { timeoutMs: 1000, isOnline: offline })).resolves.toEqual({
      ok: false,
      failure: 'offline',
    })
  })

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    const settled = settleRequest(new Promise<never>(() => {}), { timeoutMs: 60_000, isOnline: online })
    await vi.advanceTimersByTimeAsync(60_000)
    await expect(settled).resolves.toEqual({ ok: false, failure: 'timed_out' })
  })

  it('lets a server error through, so the error page and the server log still see it', async () => {
    const failed = Promise.reject(new Error('Internal error'))
    await expect(settleRequest(failed, { timeoutMs: 1000, isOnline: online })).rejects.toThrow('Internal error')
  })
})

describe('reachable', () => {
  it('answers "unavailable" for a save the network lost, so the screen can say it was not saved', async () => {
    const save = reachable(async (rating: number): Promise<{ status: 'ok'; rating: number }> => {
      throw new TypeError(`Failed to fetch (rating ${rating})`)
    })
    await expect(save(4)).resolves.toEqual({ status: 'unavailable' })
  })

  it('passes a save that arrived through unchanged', async () => {
    const save = reachable(async (rating: number) => ({ status: 'ok' as const, rating }))
    await expect(save(4)).resolves.toEqual({ status: 'ok', rating: 4 })
  })
})
