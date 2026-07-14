import { describe, expect, it } from 'vitest'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { InMemoryTasteEventStore } from '@/lib/taste/in-memory-taste-event-store'
import { parseStoredEvents } from '@/lib/taste/taste-event-store'

const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const event = (at: number, stars = 5): TasteEvent => ({
  kind: 'rating',
  rating: stars,
  brandId: 100 + at,
  target: TOP,
  occurredAt: at,
})

describe('parseStoredEvents', () => {
  it('parses valid JSON-encoded TasteEvents', () => {
    const raw = [JSON.stringify(event(1)), JSON.stringify(event(2))]
    expect(parseStoredEvents(raw)).toHaveLength(2)
    expect(parseStoredEvents(raw)[0]?.occurredAt).toBe(1)
  })

  it('drops entries that are not valid JSON', () => {
    expect(parseStoredEvents(['{not json', JSON.stringify(event(1))])).toHaveLength(1)
  })

  it('drops entries that parse but fail the schema', () => {
    // rating 9 is out of the 1–5 range — a schema violation, not JSON garbage.
    const bad = JSON.stringify({ ...event(1), rating: 9 })
    expect(parseStoredEvents([bad, JSON.stringify(event(2))])).toHaveLength(1)
  })

  it('returns an empty array for no input', () => {
    expect(parseStoredEvents([])).toEqual([])
  })
})

describe('InMemoryTasteEventStore', () => {
  it('reads back appended events oldest→newest', async () => {
    const store = new InMemoryTasteEventStore()
    await store.append('sid-a', event(1))
    await store.append('sid-a', event(2))
    const events = await store.read('sid-a')
    expect(events.map((e) => e.occurredAt)).toEqual([1, 2])
  })

  it('isolates sessions by sid', async () => {
    const store = new InMemoryTasteEventStore()
    await store.append('sid-a', event(1))
    expect(await store.read('sid-b')).toEqual([])
  })

  it('bounds the list to maxEvents, evicting the oldest', async () => {
    const store = new InMemoryTasteEventStore(() => 0, 3)
    for (let i = 1; i <= 5; i++) await store.append('sid', event(i))
    // Only the most recent 3 survive (like Redis LTRIM -3 -1).
    expect((await store.read('sid')).map((e) => e.occurredAt)).toEqual([3, 4, 5])
  })

  it('clear() erases a session (the erasure path)', async () => {
    const store = new InMemoryTasteEventStore()
    await store.append('sid', event(1))
    await store.clear('sid')
    expect(await store.read('sid')).toEqual([])
  })

  it('expires the list after the TTL (lazy, on next op)', async () => {
    let clock = 0
    const ttlSeconds = 10
    const store = new InMemoryTasteEventStore(() => clock, 100, ttlSeconds)
    await store.append('sid', event(1))
    clock = ttlSeconds * 1000 // exactly at expiry
    expect(await store.read('sid')).toEqual([])
  })

  it('refreshes the TTL on each append so an active session stays alive', async () => {
    let clock = 0
    const ttlSeconds = 10
    const store = new InMemoryTasteEventStore(() => clock, 100, ttlSeconds)
    await store.append('sid', event(1))
    clock = 8_000 // before expiry
    await store.append('sid', event(2)) // refreshes TTL to 8_000 + 10_000
    clock = 15_000 // past the ORIGINAL expiry (10_000) but before the refreshed one
    expect((await store.read('sid')).map((e) => e.occurredAt)).toEqual([1, 2])
  })
})
