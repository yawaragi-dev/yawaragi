import { describe, expect, it } from 'vitest'
import { JournalExportSchema } from '@/lib/schemas/journal-export'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { buildJournalExport } from '@/lib/taste/journal-export'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

const entry = (id: string, occurredAt: number): JournalEntry => ({
  id,
  event: { kind: 'rating', rating: 5, brandId: 1, target: TARGET, occurredAt },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: occurredAt,
  createdAt: occurredAt,
})

const EXPORTED_AT = Date.UTC(2026, 7, 17, 12, 30, 0)

describe('buildJournalExport', () => {
  it('stamps who the journal belongs to and when it was taken', () => {
    const doc = buildJournalExport({
      userId: 'user_admin',
      entries: [entry('a', 1000)],
      exportedAt: EXPORTED_AT,
    })

    expect(doc.userId).toBe('user_admin')
    expect(doc.exportedAt).toBe('2026-08-17T12:30:00.000Z')
  })

  it('carries entries verbatim so the file can restore the journal it came from', () => {
    // Round-trip fidelity is the durability half of this feature: re-importing
    // the file must reproduce the exact stored records, so the builder may not
    // reshape, reorder, or enrich them.
    const entries = [entry('a', 1000), entry('b', 2000)]
    const doc = buildJournalExport({ userId: 'u', entries, exportedAt: EXPORTED_AT })

    expect(doc.entries).toEqual(entries)
  })

  it('produces a document that validates against the export schema', () => {
    const doc = buildJournalExport({
      userId: 'u',
      entries: [entry('a', 1000)],
      exportedAt: EXPORTED_AT,
    })

    expect(() => JournalExportSchema.parse(doc)).not.toThrow()
  })

  it('exports an empty journal as an empty entry list, not a failure', () => {
    // A maintainer with nothing logged still has the right to their (empty)
    // data — the export must be a valid document, not an error.
    const doc = buildJournalExport({ userId: 'u', entries: [], exportedAt: EXPORTED_AT })

    expect(doc.entries).toEqual([])
    expect(() => JournalExportSchema.parse(doc)).not.toThrow()
  })
})
