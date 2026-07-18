import { describe, expect, it } from 'vitest'
import {
  type JournalEntry,
  JournalEntrySchema,
  journalEntriesToTasteEvents,
  journalEntryToTasteEvent,
} from '@/lib/schemas/journal-entry'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

const entry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: 'e1',
  event: { kind: 'rating', rating: 5, brandId: 42, target: TARGET, occurredAt: 1000 },
  triedAt: 1000,
  createdAt: 1000,
  ...over,
})

describe('JournalEntry schema', () => {
  it('accepts a quick check-in with no notes', () => {
    const parsed = JournalEntrySchema.safeParse(entry())
    expect(parsed.success).toBe(true)
  })

  it('carries an optional free-text note', () => {
    const parsed = JournalEntrySchema.parse(entry({ notes: 'Rice-forward, warm finish.' }))
    expect(parsed.notes).toBe('Rice-forward, warm finish.')
  })

  it('rejects an entry whose embedded event is invalid', () => {
    // rating out of the 1–5 range — the embedded TasteEvent schema must still bite.
    const bad = entry({ event: { kind: 'rating', rating: 9, brandId: 1, target: TARGET, occurredAt: 1 } })
    expect(JournalEntrySchema.safeParse(bad).success).toBe(false)
  })

  it('rejects an entry without a stable id', () => {
    expect(JournalEntrySchema.safeParse(entry({ id: '' })).success).toBe(false)
  })

  it('exposes the embedded TasteEvent as the primitive the derivation folds over', () => {
    const e = entry()
    expect(journalEntryToTasteEvent(e)).toBe(e.event)
    expect(journalEntriesToTasteEvents([entry({ id: 'a' }), entry({ id: 'b' })])).toHaveLength(2)
  })
})
