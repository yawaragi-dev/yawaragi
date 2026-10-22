'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { clearOfflineCopy, hasOfflineCopyMarker, markOfflineCopy, readOfflineCopy } from '@/lib/offline/collection-copy'

/**
 * Wipes the device's offline copy of the journal and cellar once it belongs to
 * someone other than who is signed in now — after a sign-out, an account
 * deletion or a switch of account (ADR-0009: personal data at rest on the
 * device goes with the session that put it there). Mounted in the layout so
 * it runs on whatever page the sign-out lands on.
 */
export function ClearOfflineCopy() {
  const { isLoaded, userId } = useAuth()
  useEffect(() => {
    if (!isLoaded || !hasOfflineCopyMarker()) return
    readOfflineCopy()
      .then((copy) => {
        if (copy && copy.owner === (userId ?? null)) return
        return clearOfflineCopy().then(() => markOfflineCopy(false))
      })
      .catch(() => {})
  }, [isLoaded, userId])
  return null
}
