import { describe, expect, it, vi } from 'vitest'
import type { ScanActionState } from './scan-action-state'
import { READ_CACHE_TTL_SEC, readCacheKey, upstashReadCache } from './read-cache'

const photo = (bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
const base = { sid: 'sid-a', locale: 'en', earlierRead: null }

describe('which sends of a photo share a stored answer', () => {
  it('is the same visitor sending the same photo the same way', async () => {
    expect(await readCacheKey({ ...base, image: photo([1, 2, 3]) })).toBe(await readCacheKey({ ...base, image: photo([1, 2, 3]) }))
  })

  it('is never another visitor, another photo, another language or another earlier read', async () => {
    const key = await readCacheKey({ ...base, image: photo([1, 2, 3]) })
    expect(await readCacheKey({ ...base, sid: 'sid-b', image: photo([1, 2, 3]) })).not.toBe(key)
    expect(await readCacheKey({ ...base, image: photo([1, 2, 4]) })).not.toBe(key)
    expect(await readCacheKey({ ...base, locale: 'de', image: photo([1, 2, 3]) })).not.toBe(key)
    expect(await readCacheKey({ ...base, earlierRead: { name: '獺祭' }, image: photo([1, 2, 3]) })).not.toBe(key)
  })
})

function fakeUpstash() {
  const store = new Map<string, string>()
  const calls: unknown[][] = []
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const command = JSON.parse(String(init?.body)) as unknown[]
    calls.push(command)
    if (command[0] === 'SET') store.set(String(command[1]), String(command[2]))
    const result = command[0] === 'GET' ? (store.get(String(command[1])) ?? null) : 'OK'
    return new Response(JSON.stringify({ result }), { status: 200 })
  })
  return { store, calls, cache: upstashReadCache({ restUrl: 'https://kv', restToken: 't', fetchImpl: fetchImpl as unknown as typeof fetch }) }
}

const matched = { status: 'matched', brandId: 7 } as unknown as ScanActionState

describe('the stored answer', () => {
  it('comes back for ten minutes, and holds no photo', async () => {
    const { cache, calls } = fakeUpstash()
    await cache.set('scanread:1', matched)
    expect(calls[0]).toEqual(['SET', 'scanread:1', JSON.stringify(matched), 'EX', READ_CACHE_TTL_SEC])
    expect(READ_CACHE_TTL_SEC).toBe(600)
    expect(await cache.get('scanread:1')).toEqual(matched)
  })

  it('is not kept for a limit, an error or bad input', async () => {
    const { cache, calls } = fakeUpstash()
    for (const status of ['rate_limited', 'extraction_failed', 'invalid_input', 'session_missing']) {
      await cache.set('scanread:2', { status } as unknown as ScanActionState)
    }
    expect(calls).toHaveLength(0)
  })

  it('reads as a miss when the store cannot be reached', async () => {
    const cache = upstashReadCache({
      restUrl: 'https://kv',
      restToken: 't',
      fetchImpl: (async () => {
        throw new TypeError('fetch failed')
      }) as unknown as typeof fetch,
    })
    expect(await cache.get('scanread:3')).toBeNull()
    await expect(cache.set('scanread:3', matched)).resolves.toBeUndefined()
  })
})
