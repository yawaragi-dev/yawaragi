'use client'

// `'use client'` is load-bearing: it reads Clerk's client-side session and
// drives the client router, neither of which exists on the server.

import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * Re-renders the server components when they were drawn for a different
 * visitor than the one Clerk now knows.
 *
 * Every signed-in/out decision in this app is made on the server: Clerk's
 * `<Show>` in the header and on Account calls `auth()` during the RSC render,
 * and so do the maintainer gates. Sign-in finishes on the CLIENT, though, and
 * the client router keeps showing server output rendered before it. The header
 * kept no "Sign out" and Account kept saying "Not signed in" until "Sign in"
 * was tapped a second time (maintainer report on #343).
 *
 * The comparison is server vs client, not "did the client's user change":
 * after Google's OAuth round trip the page is a fresh load, and by the time
 * Clerk reports itself loaded the session already exists — there is no change
 * to observe, yet the server rendered that page signed out. The first version
 * watched for a change and missed exactly this case.
 *
 * `router.refresh()` re-renders the current route on the server without
 * losing client state; the layout then passes the new `serverUserId` and the
 * two agree. It asks at most once per mismatch, so a server that cannot see
 * the session (a cookie the request lacks) settles instead of looping.
 */
export function RefreshOnAuthChange({ serverUserId }: { serverUserId: string | null }) {
  const { isLoaded, userId } = useAuth()
  const router = useRouter()
  const lastAskedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    const clientUserId = userId ?? null
    if (clientUserId === serverUserId) {
      lastAskedFor.current = null
      return
    }
    const mismatch = `${serverUserId ?? '-'}→${clientUserId ?? '-'}`
    if (lastAskedFor.current === mismatch) return
    lastAskedFor.current = mismatch
    router.refresh()
  }, [isLoaded, userId, serverUserId, router])

  return null
}
