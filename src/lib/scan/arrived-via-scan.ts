/**
 * Records that a visitor reached `/sake/[brandId]` by tapping a scan result
 * (the matched card's "Full bottle page" row, a disambiguation row, a
 * divergence link, or the consensus accept) rather than by any other route.
 *
 * The bottle page uses it twice: to offer "Not the bottle you scanned? Scan
 * again" (#109), and to put the visitor's own photo in the bottle slot.
 *
 * **Why a query parameter, not the per-tab sessionStorage flag it replaced.**
 * The flag had two faults the maintainer saw on sight:
 *
 * - It was never cleared. One scan, and every bottle page for the rest of the
 *   tab — reached from similar sakes, the brewery's other sakes, anywhere —
 *   asked "Not the bottle you scanned?".
 * - The server cannot read sessionStorage, so the hint could only appear after
 *   hydration, and the page shifted down under the visitor's eyes.
 *
 * A query parameter belongs to the one link that carries it, and the server
 * renders from it — so the hint is in the first paint or not at all. It is
 * not personal data: it says which kind of link was tapped, nothing about who.
 */
export const ARRIVED_VIA_SCAN_QUERY = { from: 'scan' } as const

export function hasArrivedViaScan(
  searchParams: Record<string, string | string[] | undefined>,
): boolean {
  return searchParams.from === ARRIVED_VIA_SCAN_QUERY.from
}
