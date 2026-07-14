import { describe, expect, it, vi } from 'vitest'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { UpstashTasteEventStore } from '@/lib/taste/upstash-taste-event-store'

const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const event = (at: number): TasteEvent => ({
  kind: 'rating',
  rating: 5,
  brandId: at,
  target: TOP,
  occurredAt: at,
})

// A fake `fetch` that records each command array (the JSON body) and returns
// the queued `result` values in order, so tests can assert the exact Redis
// commands the adapter issues.
function fakeFetch(results: unknown[]) {
  const commands: string[][] = []
  let call = 0
  const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    commands.push(JSON.parse(String(init?.body)) as string[])
    const result = results[call++] ?? null
    return { ok: true, json: async () => ({ result }) } as Response
  })
  return { impl: impl as unknown as typeof fetch, commands }
}

describe('UpstashTasteEventStore', () => {
  it('append issues RPUSH, then LTRIM to the last maxEvents, then EXPIRE', async () => {
    const { impl, commands } = fakeFetch([1, 'OK', 1])
    const store = new UpstashTasteEventStore('https://kv', 'tok', impl, {
      maxEvents: 50,
      ttlSeconds: 3600,
    })
    await store.append('sid-x', event(7))
    expect(commands).toEqual([
      ['RPUSH', 'taste:sid-x', JSON.stringify(event(7))],
      ['LTRIM', 'taste:sid-x', '-50', '-1'],
      ['EXPIRE', 'taste:sid-x', '3600'],
    ])
  })

  it('read issues LRANGE 0 -1 and parses the stored events', async () => {
    const stored = [JSON.stringify(event(1)), JSON.stringify(event(2))]
    const { impl, commands } = fakeFetch([stored])
    const store = new UpstashTasteEventStore('https://kv', 'tok', impl)
    const events = await store.read('sid-x')
    expect(commands[0]).toEqual(['LRANGE', 'taste:sid-x', '0', '-1'])
    expect(events.map((e) => e.occurredAt)).toEqual([1, 2])
  })

  it('read tolerates a non-array result and corrupt entries', async () => {
    const { impl: nonArray } = fakeFetch([null])
    expect(await new UpstashTasteEventStore('https://kv', 'tok', nonArray).read('s')).toEqual([])

    const { impl: corrupt } = fakeFetch([['{bad', JSON.stringify(event(3))]])
    const events = await new UpstashTasteEventStore('https://kv', 'tok', corrupt).read('s')
    expect(events.map((e) => e.occurredAt)).toEqual([3])
  })

  it('clear issues DEL', async () => {
    const { impl, commands } = fakeFetch([1])
    await new UpstashTasteEventStore('https://kv', 'tok', impl).clear('sid-x')
    expect(commands).toEqual([['DEL', 'taste:sid-x']])
  })

  it('throws on a non-ok REST response', async () => {
    const impl = vi.fn(async () => ({ ok: false, status: 500 }) as Response) as unknown as typeof fetch
    await expect(
      new UpstashTasteEventStore('https://kv', 'tok', impl).clear('s'),
    ).rejects.toThrow(/Upstash REST error 500/)
  })
})
