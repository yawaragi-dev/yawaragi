/**
 * A short-lived marker that a social sign-in (Google) is under way.
 *
 * Clicking "Continue with Google" leaves the app; the way back is a full page
 * load on `/sign-in#/sso-callback`, where Clerk finishes the sign-in in the
 * browser. The server renders that load before the session exists, so without
 * a hint it draws the signed-out page, and the visitor watched it flash and
 * then refresh (maintainer report on #343). This cookie is the hint: the
 * layout reads it and renders `<RefreshOnAuthChange />`'s wall in the very
 * first frame.
 *
 * Not personal data: the value is the literal "1" and nothing else. Set and
 * cleared from the browser only (no server action writes cookies here, per
 * CLAUDE.md), and it expires on its own after two minutes even if nothing
 * clears it. Strictly necessary for a flow the visitor started, so no consent
 * category; listed in ADR-0009's cookie table for transparency.
 */
export const SIGN_IN_PENDING_COOKIE = 'yawaragi_sign_in_pending'

const MAX_AGE_SEC = 120

function write(value: string, maxAge: number): void {
  if (typeof document === 'undefined') return
  const secure = location.protocol === 'https:' ? '; secure' : ''
  document.cookie = `${SIGN_IN_PENDING_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`
}

export function markSignInPending(): void {
  write('1', MAX_AGE_SEC)
}

export function clearSignInPending(): void {
  write('', 0)
}

/** Server-side read, from the request's cookie jar. */
export function isSignInPending(cookieJar: {
  get(name: string): { value: string } | undefined
}): boolean {
  return cookieJar.get(SIGN_IN_PENDING_COOKIE)?.value === '1'
}
