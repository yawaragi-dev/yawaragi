/**
 * The photo the visitor just scanned, held in this tab's memory so the bottle
 * page can show it in §9's bottle slot.
 *
 * The scan card already shows the photo (ADR-0015); the bottle page did not,
 * so tapping "Full bottle page" swapped the visitor's own bottle for a grey
 * placeholder. The photo cannot travel through the server — ADR-0009 makes
 * label images process-and-discard, and they are never stored — so it travels
 * the only way left: a module-level reference that survives a client-side
 * navigation, because the document does not unload.
 *
 * Deliberately memory only, not sessionStorage: a reload or a closed tab
 * drops it, which is the same lifetime the scan card's preview has. Nothing is
 * written to disk and nothing leaves the browser, so there is no new
 * processing operation for ADR-0009's RoPA.
 *
 * Browser-only. Module state on the server would be shared between every
 * request in the process, so every write is a no-op there.
 */

let photoUrl: string | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function rememberScannedPhoto(photo: Blob): void {
  if (typeof window === 'undefined') return
  if (photoUrl) URL.revokeObjectURL(photoUrl)
  photoUrl = URL.createObjectURL(photo)
  notify()
}

export function forgetScannedPhoto(): void {
  if (photoUrl) URL.revokeObjectURL(photoUrl)
  photoUrl = null
  notify()
}

export function getScannedPhotoUrl(): string | null {
  return photoUrl
}

export function subscribeScannedPhoto(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
