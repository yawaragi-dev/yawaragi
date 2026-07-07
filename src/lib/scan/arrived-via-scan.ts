/**
 * Client-side marker recording that the current tab reached a
 * `/sake/[brandId]` page by tapping a scan result (the matched result
 * card's "See full details" link, a disambiguation row, a divergence
 * link, or the consensus accept) rather than by direct navigation.
 *
 * Read by `<ScanReturnHint />` on the sake detail page to offer a
 * "Not the bottle you scanned? Scan again" affordance back to `/scan`
 * — a dead-end escape hatch for the visitor who matched the wrong
 * sake (issue #109 PR B).
 *
 * Deliberately a `sessionStorage` flag, NOT a cookie:
 *   - It is a pure client-side navigation signal that never needs to
 *     reach the server, so it carries no cookie/GDPR surface.
 *   - CLAUDE.md forbids mutating cookies from an action reached during
 *     an RSC render; sessionStorage sidesteps that entirely.
 *   - Per-tab + cleared on tab close is exactly the lifetime we want:
 *     "did THIS browsing session arrive here via scan?".
 *
 * No personal data — a single boolean-ish flag, so no lawful-basis
 * documentation is required (ADR-0009 privacy-by-default: nothing is
 * collected).
 */
export const ARRIVED_VIA_SCAN_KEY = 'yawaragi_arrived_via_scan'

export function markArrivedViaScan(): void {
  try {
    sessionStorage.setItem(ARRIVED_VIA_SCAN_KEY, '1')
  } catch {
    // Private mode / storage disabled: the return hint simply won't
    // show. It is a progressive enhancement, not load-bearing.
  }
}

export function hasArrivedViaScan(): boolean {
  try {
    return sessionStorage.getItem(ARRIVED_VIA_SCAN_KEY) === '1'
  } catch {
    return false
  }
}
