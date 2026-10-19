import { afterEach, describe, expect, it, vi } from 'vitest'
import { settleRequest } from './settle-request'

const online = () => true
const offline = () => false

describe('settleRequest', () => {
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
