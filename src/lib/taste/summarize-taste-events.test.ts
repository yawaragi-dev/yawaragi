import { describe, expect, it } from 'vitest'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { summarizeTasteEvents } from '@/lib/taste/summarize-taste-events'

const TOP = { f1: 1, f2: 1, f3: 1, f4: 1, f5: 1, f6: 1 }
const rating = (brandId: number): TasteEvent => ({
  kind: 'rating',
  rating: 5,
  brandId,
  target: TOP,
  occurredAt: 1,
})
const scan = (brandId: number): TasteEvent => ({
  kind: 'scan_accept',
  brandId,
  target: TOP,
  occurredAt: 1,
})
const seed = (descriptor: string): TasteEvent => ({
  kind: 'cross_beverage_seed',
  descriptor,
  target: TOP,
  occurredAt: 1,
})

describe('summarizeTasteEvents', () => {
  it('counts ratings and scans and collects unique seed descriptors in order', () => {
    const summary = summarizeTasteEvents([
      rating(1),
      scan(2),
      seed('smoky'),
      rating(3),
      seed('tannic'),
    ])
    expect(summary).toEqual({ ratings: 2, scans: 1, seedDescriptors: ['smoky', 'tannic'] })
  })

  it('de-duplicates repeated seed descriptors, keeping first-seen order', () => {
    const summary = summarizeTasteEvents([seed('smoky'), seed('tannic'), seed('smoky')])
    expect(summary.seedDescriptors).toEqual(['smoky', 'tannic'])
  })

  it('is all zeros / empty for no events', () => {
    expect(summarizeTasteEvents([])).toEqual({ ratings: 0, scans: 0, seedDescriptors: [] })
  })
})
