'use client'

// `'use client'` is load-bearing: the visitor's scanned photo lives in this
// tab's memory (`scanned-photo.ts`), which only the browser can read.

import { useSyncExternalStore } from 'react'
import { getScannedPhotoUrl, subscribeScannedPhoto } from '@/lib/scan/scanned-photo'

const serverSnapshot = () => null

interface BottleSlotProps {
  /** True when the visitor tapped through from a scan result (`?from=scan`). */
  showScannedPhoto: boolean
  /** The placeholder's caption, e.g. "Bottle". */
  placeholderLabel: string
  /** Alt text for the visitor's own photo. */
  photoAlt: string
}

/**
 * §9's 88×128 bottle slot.
 *
 * Arriving from a scan, it shows the photo the visitor just took — the bottle
 * they are holding, which the scan card showed a tap earlier. Otherwise, and
 * after a reload (the photo is memory-only), it is the design's labelled
 * placeholder: we have no bottle photography (#335, #334 for a drawn
 * stand-in), and a labelled slot says "a picture goes here" where a blank one
 * says "something failed to load".
 *
 * The slot has a fixed size either way, so swapping the photo in after
 * hydration moves nothing else on the page.
 */
export function BottleSlot({ showScannedPhoto, placeholderLabel, photoAlt }: BottleSlotProps) {
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

  // `aria-hidden`: the placeholder carries nothing a screen-reader user needs;
  // the name beside it is the content.
  return (
    <div
      className="flex h-32 w-22 shrink-0 items-end justify-center rounded-xl bg-ash-200 pb-2 shadow-yw-sm"
      aria-hidden="true"
      data-testid="bottle-slot"
    >
      <span className="text-micro uppercase text-ash-500">{placeholderLabel}</span>
    </div>
  )
}
