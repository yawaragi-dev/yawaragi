/**
 * "A sign-out is under way" — held in this tab's memory so the auth wall can
 * stay up for the whole of it.
 *
 * Without it, signing out flashed twice (maintainer report on #343): Clerk
 * forgets the user at once, the server has not yet, `<RefreshOnAuthChange />`
 * saw the mismatch and refreshed behind its wall; the page showed; then
 * Clerk's own redirect produced a second mismatch and a second wall. The row
 * now raises this flag before calling Clerk, the wall stays up while it is
 * set, and the sign-out ends in one full reload — which clears the flag,
 * because it is module memory, and gives the server's fresh, signed-out
 * render.
 *
 * Browser-only, like `scanned-photo.ts`: module state on the server would be
 * shared between requests, so writes are no-ops there.
 */
let active = false
const listeners = new Set<() => void>()

export function beginAuthTransition(): void {
  if (typeof window === 'undefined') return
  active = true
  for (const listener of listeners) listener()
}

/** The sign-out failed; the visitor is still signed in. */
export function endAuthTransition(): void {
  active = false
  for (const listener of listeners) listener()
}

export function isAuthTransitionActive(): boolean {
  return active
}

export function subscribeAuthTransition(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
