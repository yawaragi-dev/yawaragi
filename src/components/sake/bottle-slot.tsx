'use client'

// `'use client'` is load-bearing: the visitor's scanned photo lives in this
// tab's memory (`scanned-photo.ts`), which only the browser can read.

import { useSyncExternalStore } from 'react'
import { getScannedPhotoUrl, subscribeScannedPhoto } from '@/lib/scan/scanned-photo'

const serverSnapshot = () => null

interface BottleSlotProps {
  /** True when the visitor tapped through from a scan result (`?from=scan`). */
  showScannedPhoto: boolean
  /** Alt text for the visitor's own photo. */
  photoAlt: string
}

/**
 * §9's 88×128 bottle slot.
 *
 * Arriving from a scan, it shows the photo the visitor just took — the bottle
 * they are holding, which the scan card showed a tap earlier. Otherwise there
 * is no slot (v1.5 rule 14, "no image, no slot"): we have no bottle
 * photography (#335), and a permanent placeholder said "a picture goes here"
 * on every page. Arriving by scan the server already knows, so the slot is
 * held at a fixed size while the photo loads and nothing else moves.
 */
export function BottleSlot({ showScannedPhoto, photoAlt }: BottleSlotProps) {
  const photoUrl = useSyncExternalStore(subscribeScannedPhoto, getScannedPhotoUrl, serverSnapshot)

  if (showScannedPhoto && photoUrl) {
    return (
      <div
        className="h-32 w-22 shrink-0 overflow-hidden rounded-xl bg-ash-200 shadow-yw-sm"
        data-testid="bottle-slot"
      >
        {/* A blob: URL, which next/image cannot take — same as the scan card. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={photoAlt}
          className="h-full w-full object-cover"
          data-testid="bottle-scanned-photo"
        />
      </div>
    )
  }

  // v1.5 rule 14, "no image, no slot": the only image there ever is is the
  // photo this session took. Arriving by scan, the slot is held (the server
  // knows, so nothing jumps) while the photo loads, empty; otherwise the
  // identity is text-only and there is no slot at all.
  if (!showScannedPhoto) return null
  return (
    <div
      className="h-32 w-22 shrink-0 rounded-xl bg-ash-200 shadow-yw-sm"
      aria-hidden="true"
      data-testid="bottle-slot"
    />
  )
}
