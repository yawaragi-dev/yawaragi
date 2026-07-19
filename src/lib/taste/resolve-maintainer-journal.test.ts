import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import { NEUTRAL_AXIS } from '@/lib/taste/derive-taste-profile'
import { resolveMaintainerJournal } from '@/lib/taste/resolve-maintainer-journal'

const TARGET = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const NOW = 1_000_000

const entry = (id: string, occurredAt: number): JournalEntry => ({
  id,
  event: { kind: 'rating', rating: 5, brandId: occurredAt, target: TARGET, occurredAt },
  triedAt: occurredAt,
  createdAt: occurredAt,
})

const USER = 'user_admin'

describe('resolveMaintainerJournal', () => {
  it('is unavailable when there is no store (non-prod without Upstash)', async () => {
    const state = await resolveMaintainerJournal({ store: null, userId: USER, now: NOW })
    expect(state).toEqual({ kind: 'unavailable' })
  })

  it('is unavailable when there is no authenticated user id', async () => {
    const state = await resolveMaintainerJournal({
      store: new InMemoryJournalStore(),
      userId: null,
      now: NOW,
    })
    expect(state).toEqual({ kind: 'unavailable' })
  })

  it('is empty for a maintainer whose journal has no entries yet', async () => {
    const state = await resolveMaintainerJournal({
      store: new InMemoryJournalStore(),
      userId: USER,
      now: NOW,
    })
    expect(state).toEqual({ kind: 'empty' })
  })

  it('returns the entries plus a TasteMap derived from their embedded events', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', NOW - 1000))
    const state = await resolveMaintainerJournal({ store, userId: USER, now: NOW })

    expect(state.kind).toBe('journal')
    if (state.kind !== 'journal') throw new Error('expected journal')
    // The entries themselves are surfaced (the UI needs per-entry identity).
    expect(state.entries.map((e) => e.id)).toEqual(['a'])
    // A single positive rating pulls every axis up from the neutral midpoint
    // toward the target — proving the derivation actually ran over the entry.
    expect(state.profile.f1).toBeGreaterThan(NEUTRAL_AXIS)
  })

  it('scopes to the given user — another user id sees an empty journal', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', NOW - 1000))
    const state = await resolveMaintainerJournal({ store, userId: 'user_other', now: NOW })
    expect(state).toEqual({ kind: 'empty' })
  })
})
