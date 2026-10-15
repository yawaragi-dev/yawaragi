import type { ScanBottling } from '@/lib/schemas/label-scan-extraction'

/**
 * What the last scan read off the label about the bottling, for the sake it
 * led to, held in this tab's memory so the sake's page can start "Add your
 * bottling" from it.
 *
 * The scan card already offers the label's bottling. The way off it — "Full
 * bottle page", or the sake two photos together point at — opens §9, whose
 * "Add your bottling" started from the sake's bare name: a scan of "IKEKAME
 * Junmai Ginjo Nama" offered "Ikekame". The read cannot ride in the URL
 * without becoming a link anyone can forge into a prefill, and it is not
 * stored anywhere, so it travels like the scanned photo does: a module-level
 * value that survives a client-side navigation. A reload drops it.
 *
 * Browser-only. Module state on the server would be shared between every
 * request in the process, so every write is a no-op there.
 */

let remembered: { brandId: number; bottling: ScanBottling } | null = null
const listeners = new Set<() => void>()

/** The label's bottling read for `brandId`; `undefined` forgets it. */
export function rememberScannedBottling(brandId: number, bottling: ScanBottling | undefined): void {
  if (typeof window === 'undefined') return
  remembered = bottling ? { brandId, bottling } : null
  for (const listener of listeners) listener()
}

/** The label's bottling, if the last scan read one for this sake. */
export function getScannedBottling(brandId: number): ScanBottling | null {
  return remembered?.brandId === brandId ? remembered.bottling : null
}

export function subscribeScannedBottling(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
