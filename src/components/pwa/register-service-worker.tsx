'use client'

import { useEffect } from 'react'

/**
 * Registers `public/sw.js`, the worker that shows "You're offline" when a
 * page load has no network (#480, slice 3). Production builds only: in
 * development a registered worker outlives the dev server on that origin and
 * wraps every reload of whatever runs there next.
 */
export function RegisterServiceWorker({ enabled = process.env.NODE_ENV === 'production' }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // No worker means the browser's own offline page; nothing else changes.
    })
  }, [enabled])
  return null
}
