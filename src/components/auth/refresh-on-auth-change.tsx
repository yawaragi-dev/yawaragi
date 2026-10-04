'use client'

// `'use client'` is load-bearing: it subscribes to Clerk's client-side session
// and drives the client router, neither of which exists on the server.

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * Re-renders the server components when the visitor signs in or out.
 *
 * Every signed-in/out decision in this app is made on the server: Clerk's
 * `<Show>` in the header and on Account calls `auth()` during the RSC render,
 * and so do the maintainer gates. After a sign-in, Clerk lands the visitor
 * with a CLIENT-side navigation, and the client router reuses the server
 * output it already has — rendered while they were signed out. The header kept
 * no "Sign out" and Account kept saying "Not signed in" until the next server
 * render, which in practice meant tapping "Sign in" a second time (maintainer
 * report on #343).
 *
 * `router.refresh()` asks the server for a fresh render of the current route
 * without losing client state, so every `auth()` call sees the new session.
 * It runs on a real change of user only: not on mount, and not while Clerk is
 * still loading (undefined → null or → an id is Clerk settling, not a
 * sign-in). Mounted once, in the locale layout, so it covers every page.
 */
export function RefreshOnAuthChange() {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  // The user this page was last rendered for, once Clerk has said.
  const settledUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!isLoaded) return
    const current = userId ?? null
    if (settledUserId.current === undefined) {
      settledUserId.current = current
      return
    }
    if (settledUserId.current !== current) {
      settledUserId.current = current
      router.refresh()
    }
  }, [isLoaded, userId, router])

  return null
}
