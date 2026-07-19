import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

// Hoisted holder for the in-memory store, shared with the mocked factory (see
// taste-actions.test.ts for the same pattern).
const h = vi.hoisted(() => ({ store: null as unknown }))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: 'user_admin' })),
}))
vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: vi.fn(async () => true),
}))
vi.mock('@/lib/sakenowa/lookup', () => ({
  lookupFlavorChart: vi.fn(),
}))
vi.mock('@/lib/taste/get-journal-store', () => ({
  getJournalStore: vi.fn(() => h.store),
}))

import { auth } from '@clerk/nextjs/server'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import {
  clearJournal,
  deleteJournalEntry,
  editJournalNotes,
  logSakeToJournal,
} from '@/lib/taste/journal-actions'
import type { JournalActionState } from '@/lib/taste/journal-action-state'

const CHART: FlavorChart = {
  source: 'sakenowa',
  brandId: 123,
  f1: 1,
  f2: 1,
  f3: 1,
  f4: 1,
  f5: 1,
  f6: 1,
}

const USER = 'user_admin'

function store(): InMemoryJournalStore {
  return h.store as InMemoryJournalStore
}

/** Type-narrow to the ok state (with its entries) or fail the test. */
function okEntries(state: JournalActionState) {
  expect(state.status).toBe('ok')
  if (state.status !== 'ok') throw new Error('expected ok')
  return state.entries
}

beforeEach(() => {
  vi.clearAllMocks()
  h.store = new InMemoryJournalStore()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  vi.mocked(auth).mockResolvedValue({ userId: USER } as never)
  vi.mocked(lookupFlavorChart).mockResolvedValue(CHART)
})

describe('logSakeToJournal', () => {
  it('creates a rating entry keyed by the maintainer and returns the journal', async () => {
    const entries = okEntries(await logSakeToJournal({ brandId: 123, rating: 5, notes: 'warm finish' }))
    expect(entries).toHaveLength(1)
    expect(entries[0]!.event).toMatchObject({ kind: 'rating', rating: 5, brandId: 123 })
    expect(entries[0]!.notes).toBe('warm finish')
    // Persisted under the user id, not a session.
    expect(await store().read(USER)).toHaveLength(1)
  })

  it('defaults triedAt to now and mirrors it onto the event occurredAt', async () => {
    const entries = okEntries(await logSakeToJournal({ brandId: 123, rating: 4 }))
    expect(entries[0]!.triedAt).toBe(entries[0]!.event.occurredAt)
  })

  it('honours a backdated triedAt', async () => {
    const entries = okEntries(await logSakeToJournal({ brandId: 123, rating: 4, triedAt: 42 }))
    expect(entries[0]!.triedAt).toBe(42)
    expect(entries[0]!.event.occurredAt).toBe(42)
  })

  it('drops a whitespace-only note to undefined', async () => {
    const entries = okEntries(await logSakeToJournal({ brandId: 123, rating: 4, notes: '   ' }))
    expect(entries[0]!.notes).toBeUndefined()
  })

  it('skips when the sake has no FlavorChart', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(null)
    const state = await logSakeToJournal({ brandId: 999, rating: 5 })
    expect(state.status).toBe('skipped_no_profile')
    expect(await store().read(USER)).toHaveLength(0)
  })

  it('rejects an out-of-range rating before any lookup', async () => {
    const state = await logSakeToJournal({ brandId: 123, rating: 9 })
    expect(state.status).toBe('invalid_input')
    expect(lookupFlavorChart).not.toHaveBeenCalled()
  })

  it('is forbidden for a non-maintainer, and writes nothing', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    const state = await logSakeToJournal({ brandId: 123, rating: 5 })
    expect(state.status).toBe('forbidden')
    expect(await store().read(USER)).toHaveLength(0)
  })

  it('is unavailable when no journal store is configured', async () => {
    h.store = null
    const state = await logSakeToJournal({ brandId: 123, rating: 5 })
    expect(state.status).toBe('unavailable')
  })
})

describe('editJournalNotes', () => {
  it('updates the note on an existing entry', async () => {
    const created = okEntries(await logSakeToJournal({ brandId: 123, rating: 5 }))
    const id = created[0]!.id
    const entries = okEntries(await editJournalNotes(id, 'nutty, dry'))
    expect(entries[0]!.notes).toBe('nutty, dry')
  })

  it('clears the note when passed an empty string', async () => {
    const created = okEntries(await logSakeToJournal({ brandId: 123, rating: 5, notes: 'old' }))
    const entries = okEntries(await editJournalNotes(created[0]!.id, '   '))
    expect(entries[0]!.notes).toBeUndefined()
  })

  it('is not_found for an unknown entry id', async () => {
    const state = await editJournalNotes('nope', 'x')
    expect(state.status).toBe('not_found')
  })
})

describe('deleteJournalEntry', () => {
  it('removes one entry, leaving the rest', async () => {
    await logSakeToJournal({ brandId: 123, rating: 5 })
    const two = okEntries(await logSakeToJournal({ brandId: 123, rating: 4 }))
    const removeId = two[0]!.id
    const entries = okEntries(await deleteJournalEntry(removeId))
    expect(entries.map((e) => e.id)).not.toContain(removeId)
    expect(entries).toHaveLength(1)
  })

  it('is not_found for an unknown entry id', async () => {
    const state = await deleteJournalEntry('nope')
    expect(state.status).toBe('not_found')
  })
})

describe('clearJournal', () => {
  it('erases the whole journal (GDPR erasure)', async () => {
    await logSakeToJournal({ brandId: 123, rating: 5 })
    const entries = okEntries(await clearJournal())
    expect(entries).toHaveLength(0)
    expect(await store().read(USER)).toHaveLength(0)
  })

  it('is forbidden for a non-maintainer', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect((await clearJournal()).status).toBe('forbidden')
  })
})
