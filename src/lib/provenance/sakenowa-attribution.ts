/**
 * Per ADR-0014: pages render `<SakenowaAttribution />` only when at
 * least one of the records they actually rendered has a source that
 * requires Sakenowa attribution. Pages collect rendered sources
 * into a Set and call `requiresSakenowaAttribution(sources)` before
 * mounting the component.
 *
 * Generic by design: when a future source comes with its own
 * attribution clause (NTA brewery maps, Wikidata CC-BY, etc.), the
 * same pattern adds a sibling predicate + sibling attribution
 * component without touching this one.
 */
export const SAKENOWA_ATTRIBUTION_SOURCES = new Set<string>([
  'sakenowa',
  'sakenowa_inferred',
])

export function requiresSakenowaAttribution(
  sources: Iterable<string | null | undefined>,
): boolean {
  for (const s of sources) {
    if (s !== null && s !== undefined && SAKENOWA_ATTRIBUTION_SOURCES.has(s)) {
      return true
    }
  }
  return false
}
