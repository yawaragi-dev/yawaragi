'use client'

import { useEffect } from 'react'
import { type OfflineCollectionCopy, markOfflineCopy, saveOfflineCopy } from '@/lib/offline/collection-copy'

/**
 * Keeps the read-only copy of the journal and cellar on this device current:
 * every online visit to Collection replaces it (design question Z). A failed
 * write changes nothing on screen; the copy is a convenience, not a record.
 */
export function SaveOfflineCopy({ copy }: { copy: OfflineCollectionCopy }) {
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return
    saveOfflineCopy(copy)
      .then(() => markOfflineCopy(true))
      .catch(() => {})
  }, [copy])
  return null
}
