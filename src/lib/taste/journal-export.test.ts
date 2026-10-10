import { describe, expect, it } from 'vitest'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import { parseCollectionExport } from '@/lib/schemas/journal-export'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { buildCollectionExport } from '@/lib/taste/journal-export'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

const entry = (id: string, occurredAt: number): JournalEntry => ({
  schemaVersion: 2,
  id,
  event: { kind: 'rating', rating: 5, brandId: 1, target: TARGET, occurredAt },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: occurredAt,
  createdAt: occurredAt,
})

const bottle: CellarBottle = {
  schemaVersion: 1,
  brandId: 7,
  sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
  count: 2,
  openedAt: null,
  addedAt: 5,
  updatedAt: 5,
}

const bottling: Expression = {
  schemaVersion: 1,
  id: 'x1',
  own: true,
  brandId: 7,
  line: { nameKanji: '而今', nameRomaji: 'Jikon' },
  name: 'Jikon Nama 2025',
  createdAt: 4,
  updatedAt: 4,
}

const EXPORTED_AT = Date.UTC(2026, 7, 17, 12, 30, 0)
const none = { records: [], rejected: [] }

describe('buildCollectionExport', () => {
  it('stamps who the collection belongs to and when it was taken', () => {
    const doc = buildCollectionExport({
      userId: 'user_admin',
      journal: { records: [entry('a', 1000)], rejected: [] },
      cellar: none,
      expressions: none,
      exportedAt: EXPORTED_AT,
    })

    expect(doc.formatVersion).toBe(3)
    expect(doc.userId).toBe('user_admin')
    expect(doc.exportedAt).toBe('2026-08-17T12:30:00.000Z')
  })

  it('carries journal, cellar and own-bottling records verbatim so the file restores what it came from', () => {
    const entries = [entry('a', 1000), entry('b', 2000)]
    const doc = buildCollectionExport({
      userId: 'u',
      journal: { records: entries, rejected: [] },
      cellar: { records: [bottle], rejected: [] },
      expressions: { records: [bottling], rejected: [] },
      exportedAt: EXPORTED_AT,
    })

    expect(doc.journal).toEqual(entries)
    expect(doc.cellar).toEqual([bottle])
    expect(doc.expressions).toEqual([bottling])
  })

  it('keeps records the store held but could not read, raw, instead of dropping them', () => {
    const doc = buildCollectionExport({
      userId: 'u',
      journal: { records: [], rejected: [{ store: 'journal', id: 'x', raw: '{bad', reason: 'json' }] },
      cellar: { records: [], rejected: [{ store: 'cellar', id: '9', raw: '{"schemaVersion":7}', reason: 'newer' }] },
      expressions: { records: [], rejected: [{ store: 'expressions', id: 'q', raw: '[]', reason: 'shape' }] },
      exportedAt: EXPORTED_AT,
    })

    expect(doc.rejected.map((r) => [r.store, r.id, r.raw])).toEqual([
      ['journal', 'x', '{bad'],
      ['cellar', '9', '{"schemaVersion":7}'],
      ['expressions', 'q', '[]'],
    ])
  })

  it('round-trips through the reader unchanged', () => {
    const doc = buildCollectionExport({
      userId: 'u',
      journal: { records: [entry('a', 1000)], rejected: [] },
      cellar: { records: [bottle], rejected: [] },
      expressions: { records: [bottling], rejected: [] },
      exportedAt: EXPORTED_AT,
    })
    const parsed = parseCollectionExport(JSON.parse(JSON.stringify(doc)))
    expect(parsed).toEqual({ ok: true, doc })
  })
})

describe('parseCollectionExport', () => {
  it('reads a format-1 file written before the cellar existed, upcasting its entries', () => {
    // Exactly what `pnpm journal:export` wrote before ADR-0024: `entries`, and
    // entries with no schemaVersion.
    const v1Entry: Record<string, unknown> = { ...entry('a', 1000) }
    delete v1Entry.schemaVersion
    const parsed = parseCollectionExport({
      formatVersion: 1,
      exportedAt: '2026-08-17T12:30:00.000Z',
      userId: 'u',
      entries: [v1Entry],
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.journal).toEqual([entry('a', 1000)])
    expect(parsed.doc.cellar).toEqual([])
    expect(parsed.doc.expressions).toEqual([])
  })

  it('reads a format-2 file written before own bottlings existed', () => {
    const parsed = parseCollectionExport({
      formatVersion: 2,
      exportedAt: '2026-10-05T03:30:00.000Z',
      userId: 'u',
      journal: [entry('a', 1000)],
      cellar: [bottle],
      rejected: [],
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.doc.formatVersion).toBe(3)
    expect(parsed.doc.cellar).toEqual([bottle])
    expect(parsed.doc.expressions).toEqual([])
  })

  it('refuses a format it does not know rather than guessing', () => {
    const parsed = parseCollectionExport({ formatVersion: 4, journal: [] })
    expect(parsed).toMatchObject({ ok: false, reason: 'unknown_format' })
  })

  it('refuses the whole file when one record cannot be brought up to date', () => {
    const parsed = parseCollectionExport({
      formatVersion: 2,
      exportedAt: '2026-08-17T12:30:00.000Z',
      userId: 'u',
      journal: [entry('a', 1000), { id: 'b' }],
      cellar: [],
      rejected: [],
    })
    expect(parsed).toMatchObject({ ok: false, reason: 'invalid_record', detail: 'journal[1]: invalid' })
  })

  it('refuses the file when an own bottling in it cannot be read', () => {
    const parsed = parseCollectionExport({
      formatVersion: 3,
      exportedAt: '2026-10-10T03:30:00.000Z',
      userId: 'u',
      journal: [],
      cellar: [],
      expressions: [{ ...bottling, name: '' }],
      rejected: [],
    })
    expect(parsed).toMatchObject({ ok: false, reason: 'invalid_record', detail: 'expressions[0]: invalid' })
  })
})
