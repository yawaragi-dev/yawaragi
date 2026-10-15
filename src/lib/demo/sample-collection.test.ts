import { describe, expect, it } from 'vitest'
import { CellarBottleSchema } from '@/lib/schemas/cellar-bottle'
import { ExpressionSchema } from '@/lib/schemas/expression'
import { JournalEntrySchema, journalEntriesToTasteEvents } from '@/lib/schemas/journal-entry'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import { buildSampleCollection } from './sample-collection'

const NOW = Date.UTC(2026, 9, 15, 12)
const notes = (key: string) => `note ${key}`

describe('the sample collection', () => {
  const sample = buildSampleCollection({ now: NOW, notes })

  it('is data the real stores would accept', () => {
    for (const entry of sample.entries) expect(JournalEntrySchema.safeParse(entry).success).toBe(true)
    for (const row of sample.cellar) expect(CellarBottleSchema.safeParse(row).success).toBe(true)
    for (const bottling of sample.expressions) expect(ExpressionSchema.safeParse(bottling).success).toBe(true)
  })

  it('has enough tastings for a palate, newest first, none in the future', () => {
    expect(sample.entries.length).toBeGreaterThanOrEqual(8)
    const tried = sample.entries.map((e) => e.triedAt)
    expect(tried).toEqual([...tried].sort((a, b) => b - a))
    expect(Math.max(...tried)).toBeLessThan(NOW)
  })

  it('draws a palate with a character: more floral and light than rich', () => {
    const profile = deriveTasteProfile(journalEntriesToTasteEvents(sample.entries), NOW)
    expect(profile.f1).toBeGreaterThan(profile.f3)
    expect(profile.f6).toBeGreaterThan(profile.f3)
  })

  it('logs tastings and bottles against its own bottling', () => {
    const [bottling] = sample.expressions
    expect(sample.entries.some((e) => e.expression?.id === bottling.id)).toBe(true)
    expect(sample.cellar.some((r) => r.expression?.id === bottling.id)).toBe(true)
  })

  it('moves with the clock, so ages read the same on any day', () => {
    const later = buildSampleCollection({ now: NOW + 86_400_000, notes })
    expect(later.entries[0].triedAt - sample.entries[0].triedAt).toBe(86_400_000)
  })
})
