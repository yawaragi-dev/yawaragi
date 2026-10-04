'use client'

// `'use client'` is load-bearing: it reads Clerk's client-side session, the
// URL hash and timers, and drives the client router — none of which exist on
// the server.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import {
  isAuthTransitionActive,
  subscribeAuthTransition,
} from '@/lib/auth/auth-transition'
import { clearSignInPending } from '@/lib/auth/sign-in-pending'

const noopSubscribe = () => () => {}
const WALL_TIMEOUT_MS = 10_000

interface RefreshOnAuthChangeProps {
  /** The user the server rendered this page for (`auth().userId`). */
  serverUserId: string | null
  /** A Google sign-in was started (`yawaragi_sign_in_pending`), read on the server. */
  signInPending: boolean
  /** What the wall says to assistive tech and on screen, e.g. "Signing you in". */
  label: string
}

/**
 * Keeps the server-rendered page in step with who is signed in, and hides it
 * while it is not.
 *
 * Every signed-in/out decision here is made on the server: Clerk's `<Show>` in
 * Account and the maintainer gates call `auth()` during the RSC render. Sign-in
 * finishes on the CLIENT, so the page on screen was drawn for the wrong person
 * until a re-render. Two fixes in one component (maintainer reports on #343):
 *
 * 1. **Refresh.** When Clerk's user differs from the one the server rendered
 *    for, `router.refresh()` re-renders on the server; the layout then passes
 *    the new `serverUserId` and the two agree. Server vs client, not "did the
 *    client's user change": after Google's round trip the page is a fresh
 *    load and Clerk already has the session when it reports loaded, so there
 *    is no change to see. At most once per mismatch, so a server that cannot
 *    see the session settles instead of looping.
 * 2. **Wall.** The refresh worked but was visible: the signed-out page, then
 *    the signed-in one. An opaque, full-screen wall covers the page while it is
 *    out of date — during the mismatch, while Clerk finishes a Google sign-in
 *    on `#/sso-callback`, and (from the server's very first frame, via the
 *    pending cookie) between the return from Google and Clerk loading. It comes
 *    down the moment the page is right, and after 10 s regardless, so a failed
 *    sign-in can never strand anyone behind it.
 *
 * Returning from Google WITHOUT signing in (cancelled at the consent screen)
 * lands on the plain sign-in route, not the callback, so the wall drops at once.
 */
export function RefreshOnAuthChange({
  serverUserId,
  signInPending,
  label,
}: RefreshOnAuthChangeProps) {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false)
  const lastAskedFor = useRef<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  // A sign-out is in flight: it ends in a full reload, so hold the wall and
  // leave the refreshing to that reload rather than racing it.
  const signingOut = useSyncExternalStore(
    subscribeAuthTransition,
    isAuthTransitionActive,
    () => false,
  )

  const clientUserId = userId ?? null
  // Clerk's answer only counts in the browser: during SSR and the hydration
  // render it is the server's own initial state, which says nothing new.
  const known = hydrated && isLoaded
  const mismatch = known && clientUserId !== serverUserId
  const callbackInProgress =
    known &&
    signInPending &&
    clientUserId === null &&
    window.location.hash.includes('sso-callback')
  const covering =
    !timedOut && (signingOut || (known ? mismatch || callbackInProgress : signInPending))

  useEffect(() => {
    if (signingOut) return
    if (!mismatch) {
      lastAskedFor.current = null
      return
    }
    const key = `${serverUserId ?? '-'}→${clientUserId ?? '-'}`
    if (lastAskedFor.current === key) return
    lastAskedFor.current = key
    router.refresh()
  }, [signingOut, mismatch, serverUserId, clientUserId, router])

  useEffect(() => {
    // The page is right and nothing is in flight: the hint has done its job.
    if (signInPending && known && !mismatch && !callbackInProgress) clearSignInPending()
  }, [signInPending, known, mismatch, callbackInProgress])

  useEffect(() => {
    if (!covering) return
    const timer = setTimeout(() => setTimedOut(true), WALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [covering])

  if (!covering) return null

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      // Above everything the app draws (dialogs are z-50/60), on the same
      // ground as the page so it reads as "loading", not as an error.
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ground"
      data-testid="auth-transition-wall"
    >
      <p className="text-body text-ash-600">{label}</p>
    </div>
  )
}
