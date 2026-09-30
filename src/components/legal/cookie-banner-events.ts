'use client'

/**
 * The channel a "reopen cookie preferences" request travels on.
 *
 * It was a `window` event, and that had a hole in it. `<CookieBanner />`
 * registered its listener in an effect, so the listener did not exist until
 * that component had hydrated — while every control that reopens the banner
 * (§15's Cookie-settings row, the legal footer's link) is in the SSR HTML and
 * clickable immediately. A dispatch in that window reached nobody: the tap did
 * nothing, and the visitor's only way to WITHDRAW consent silently failed.
 * ADR-0009 requires withdrawal to be as easy as giving, so "works once
 * hydration finishes" is not good enough.
 *
 * CI caught it before a visitor did — §15's row passed locally and failed on
 * the slower runner, which is the same race with the timing dial turned up.
 *
 * So it is an external store the banner READS DURING RENDER via
 * `useSyncExternalStore` instead of a message it has to be awake to hear. A
 * request made before the banner's first client render is already in the
 * snapshot that render reads, so the banner comes up open. (The obvious
 * alternative — drain a pending flag in an effect — is what React 19's
 * `react-hooks/set-state-in-effect` rule exists to stop, and it would still be
 * one render late.)
 *
 * `'use client'` keeps the mutable module state on the client side of the
 * boundary: in a server module it would be shared by every request the process
 * serves. The server snapshot is therefore always `false`, which is also the
 * honest answer — nobody has tapped anything yet — so hydration matches.
 *
 * Module state rather than storage, so no consent question of its own: it is
 * one boolean about this page session.
 */

let requested = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * Ask `<CookieBanner />` to open in Customise.
 *
 * The one way to reopen the banner. Idempotent, so a double tap in the
 * hydration window does not queue two requests.
 */
export function requestCookiePreferences(): void {
  if (requested) return
  requested = true
  emit()
}

/**
 * Clear the request. `<CookieBanner />` calls this when the visitor leaves the
 * banner — otherwise the request would hold it open against their close.
 */
export function clearCookiePreferencesRequest(): void {
  if (!requested) return
  requested = false
  emit()
}

/** `useSyncExternalStore` subscribe. */
export function subscribeCookiePreferences(onChange: () => void): () => void {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** `useSyncExternalStore` client snapshot. */
export function isCookiePreferencesRequested(): boolean {
  return requested
}

/**
 * `useSyncExternalStore` server snapshot. Always `false`: on the server nobody
 * has tapped anything, and it must match the first client render.
 */
export function isCookiePreferencesRequestedOnServer(): false {
  return false
}
