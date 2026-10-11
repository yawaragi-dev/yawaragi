import type { DeletedBottling } from '@/lib/collection/bottling-changes'

/**
 * The bottling a visitor has just deleted, held for as long as its Undo is
 * offered (design v1.6.2: "{name} deleted · Undo", 6.8s).
 *
 * The delete happens on the bottling's page and the notice appears on the
 * page it lands on, so the undo has to outlive a navigation. It is kept here,
 * in the browser's memory, and read with `useSyncExternalStore` — the notice
 * pulls it during render rather than waiting to be told, so there is no window
 * in which a message could be sent before anyone is listening (the playbook's
 * rule 14). A full page reload drops it, which is the right thing to do with
 * an undo.
 */
export interface PendingUndo {
  deleted: DeletedBottling
  /** Epoch ms the delete happened; the notice counts its 6.8s from here. */
  at: number
}

let pending: PendingUndo | null = null
const listeners = new Set<() => void>()

export function setPendingUndo(next: PendingUndo | null): void {
  pending = next
  for (const listener of listeners) listener()
}

export function subscribePendingUndo(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getPendingUndo = (): PendingUndo | null => pending
/** On the server there is never an undo pending. */
export const getServerPendingUndo = (): PendingUndo | null => null
