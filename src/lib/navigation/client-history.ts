'use client'

// `'use client'` is not about hooks — there are none here. It keeps the module
// on the client side of the boundary, so the mutable counter below cannot be
// reached from a server component. Module state in a server module is shared
// by every request the process serves, and a per-visitor navigation count
// leaking across visitors would be both wrong and a privacy problem.

/**
 * How many client-side navigations this page session has made.
 *
 * The minimal honest version of the history stack rule 11 describes. It exists
 * because every ambient signal for "is there an in-app page behind me" is
 * wrong in a way that matters:
 *
 * - `document.referrer` reflects the document *load*, so an App Router
 *   navigation does not update it. A visitor who loads `/en/scan` and taps
 *   Imprint in the footer has an empty referrer, and a referrer-only check
 *   reads that as "nowhere to go back to" — the reported bug.
 * - `window.history.length` counts entries we do not own. It is already >1 in
 *   a fresh tab that has navigated once (and in Playwright, where the context
 *   starts on `about:blank`), so it says "yes" for cold deep-links too.
 *
 * Module state instead, deliberately:
 *
 * - It counts **only** navigations this SPA session performed, which is
 *   exactly the question — those are the entries `router.back()` can pop and
 *   land on a Yawaragi page.
 * - A full page load resets it to 0, which is correct: after a reload there is
 *   nothing of ours behind us, whatever the browser's history says.
 * - No `sessionStorage`, so it raises no consent question. Navigation state
 *   would be strictly necessary storage, but "no storage at all" needs no
 *   argument and no RoPA entry (ADR-0009).
 *
 * The cost is that it is conservative: it says "no" when it cannot be sure,
 * and every caller must therefore have a working non-history fallback. That is
 * the contract `<BackLink />` is built on.
 */
let clientNavigations = 0

/** Called by `<ClientHistoryTracker />` on each client-side navigation. */
export function recordClientNavigation(): void {
  clientNavigations += 1
}

/** True when `router.back()` will land on a page this session rendered. */
export function hasClientHistory(): boolean {
  return clientNavigations > 0
}

/** Test-only: module state outlives a single `render()`. */
export function resetClientHistory(): void {
  clientNavigations = 0
}
