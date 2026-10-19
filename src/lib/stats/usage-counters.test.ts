import { describe, expect, it, vi } from 'vitest'
import { readUsageCounts, recordUsageEvent, usageKey } from './usage-counters'

const URL_ = 'https://example.upstash.io'

function fakeFetch(reply: unknown = [{ result: 1 }, { result: 1 }]) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(reply)))
}

describe('usage counters', () => {
  it('keeps one tally per day and per environment, so preview and local runs never count as the live site', () => {
    const day = new Date('2026-10-19T23:59:00Z')
    expect(usageKey('production', day)).toBe('stats:production:2026-10-19')
    expect(usageKey('preview', day)).toBe('stats:preview:2026-10-19')
  })

  it('adds one to the event in that day’s tally and lets the tally expire after about thirteen months', async () => {
    const fetchImpl = fakeFetch()
    await recordUsageEvent('scan:matched', {
      restUrl: URL_,
      restToken: 't',
      scope: 'production',
      now: new Date('2026-10-19T10:00:00Z'),
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe(`${URL_}/pipeline`)
    expect(JSON.parse(String(init?.body))).toEqual([
      ['HINCRBY', 'stats:production:2026-10-19', 'scan:matched', '1'],
      ['EXPIRE', 'stats:production:2026-10-19', String(400 * 24 * 60 * 60)],
    ])
  })

  it('never throws: a count that cannot be written is dropped, not an error for the visitor', async () => {
    const fetchImpl = vi.fn(async () => new Response('down', { status: 503 }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(
      recordUsageEvent('search', { restUrl: URL_, restToken: 't', scope: 'production', fetchImpl }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('reads a day’s tally back as event → count', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ result: ['visit', '12', 'scan:matched', '3'] })))
    const counts = await readUsageCounts('production', new Date('2026-10-19T00:00:00Z'), {
      restUrl: URL_,
      restToken: 't',
      fetchImpl,
    })
    expect(counts).toEqual({ visit: 12, 'scan:matched': 3 })
  })
})
