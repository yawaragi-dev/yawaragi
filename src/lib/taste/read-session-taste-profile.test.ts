import { describe, expect, it } from 'vitest'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { InMemoryTasteEventStore } from '@/lib/taste/in-memory-taste-event-store'
import { readSessionTasteProfile } from '@/lib/taste/read-session-taste-profile'

const NOW = 1_700_000_000_000
const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const rating = (brandId: number): TasteEvent => ({
  kind: 'rating',
  rating: 5,
  brandId,
  target: TOP,
  occurredAt: NOW,
})

describe('readSessionTasteProfile', () => {
  it('is unavailable when the store is null (non-production without env)', async () => {
    expect(await readSessionTasteProfile({ store: null, sid: 'sid', now: NOW })).toEqual({
      kind: 'unavailable',
    })
  })

  it('is unavailable when there is no session id', async () => {
    const store = new InMemoryTasteEventStore()
    expect(await readSessionTasteProfile({ store, sid: null, now: NOW })).toEqual({
      kind: 'unavailable',
    })
  })

  it('is cold_start when the session has no events yet', async () => {
    const store = new InMemoryTasteEventStore()
    expect(await readSessionTasteProfile({ store, sid: 'sid', now: NOW })).toEqual({
      kind: 'cold_start',
    })
  })

  it('derives the profile and returns the events when the session has some', async () => {
    const store = new InMemoryTasteEventStore()
    await store.append('sid', rating(10))
    const result = await readSessionTasteProfile({ store, sid: 'sid', now: NOW })
    expect(result.kind).toBe('profile')
    if (result.kind !== 'profile') return
    expect(result.profile.f1).toBeCloseTo(0.7, 5) // a 5-star pulls toward the target
    expect(result.events).toHaveLength(1)
  })
})
