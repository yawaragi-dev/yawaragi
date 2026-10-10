'use client'

import { useEffect } from 'react'
import { COLLECTION_SEGMENT_COOKIE, type CollectionSegment } from '@/lib/collection/segment'

/**
 * Remembers the Collection segment a link opened, so a plain `/collection`
 * opens there next time (design v1.5, #369). A session cookie — no
 * `Max-Age`, so it ends with the browser session — set in the browser:
 * the page is a server component, and only middleware writes cookies on the
 * server in this app.
 */
export function RememberCollectionSegment({ segment }: { segment: CollectionSegment }) {
  useEffect(() => {
    document.cookie = `${COLLECTION_SEGMENT_COOKIE}=${segment}; Path=/; SameSite=Lax`
  }, [segment])
  return null
}
