import type { TasteEvent } from '@/lib/schemas/taste-event'

/**
 * A compact, name-free summary of what shaped a TasteProfile — for the
 * `/profile` "what shaped this" line. Counts by kind, plus the unique
 * cross-beverage descriptors (which the event carries directly). Deliberately
 * does NOT resolve brandId → name: that would need a per-event DB lookup, and
 * the counts + seed descriptors are enough to make the profile's provenance
 * legible without it.
 */
export interface TasteEventSummary {
  readonly ratings: number
  readonly scans: number
  /** Unique seed descriptors, in first-seen order. */
  readonly seedDescriptors: readonly string[]
}

export function summarizeTasteEvents(events: readonly TasteEvent[]): TasteEventSummary {
  let ratings = 0
  let scans = 0
  const seedDescriptors: string[] = []
  const seen = new Set<string>()
  for (const event of events) {
    if (event.kind === 'rating') {
      ratings += 1
    } else if (event.kind === 'scan_accept') {
      scans += 1
    } else if (event.kind === 'cross_beverage_seed') {
      if (!seen.has(event.descriptor)) {
        seen.add(event.descriptor)
        seedDescriptors.push(event.descriptor)
      }
    }
  }
  return { ratings, scans, seedDescriptors }
}
