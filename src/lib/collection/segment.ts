/**
 * §11's segments, and which one Collection opens on (design v1.5, #369):
 * the one a link names (`?tab=`), else the one the visitor was last on, else
 * Journal — a new visitor starts where the core loop is.
 *
 * "Last on" is a session cookie written by `<RememberCollectionSegment />`
 * when a segment is chosen. It holds only `journal` or `cellar` — a UI choice
 * the visitor made, no identifier — and ends with the browser session
 * (ADR-0009 RoPA).
 */
export const COLLECTION_SEGMENTS = ['journal', 'cellar'] as const
export type CollectionSegment = (typeof COLLECTION_SEGMENTS)[number]

export const COLLECTION_SEGMENT_COOKIE = 'yawaragi_collection_tab'

/** The segment `value` names, or `null` if it names none. */
export function parseCollectionSegment(value: unknown): CollectionSegment | null {
  return typeof value === 'string' && (COLLECTION_SEGMENTS as readonly string[]).includes(value)
    ? (value as CollectionSegment)
    : null
}

export function pickCollectionSegment(tabParam: unknown, remembered: unknown): CollectionSegment {
  return parseCollectionSegment(tabParam) ?? parseCollectionSegment(remembered) ?? 'journal'
}
