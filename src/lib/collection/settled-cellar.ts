import 'server-only'

import { type CellarChange, applyCellarChange, settleOpenRows } from '@/lib/collection/cellar'
import type { CellarStore } from '@/lib/collection/cellar-store'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'

/**
 * Reading and writing the cellar for an action (ADR-0025, 2026-10-11
 * amendment). Not a `'use server'` module: the action files call it.
 *
 * Every action that reads rows in order to change them starts from
 * {@link readSettledCellar}, not from `cellar.read`: a row written before v3
 * may hold its open bottle under the sealed key, and a change computed from
 * its `cellarRowKey` would then write beside the stored row instead of over
 * it. Settling first moves such a row to where its key says it is.
 */
interface CellarAccess {
  userId: string
  cellar: CellarStore
}

export async function writeCellarChange(
  { userId, cellar }: CellarAccess,
  change: CellarChange,
): Promise<void> {
  // Removes first: a row that changes kind leaves one key for another.
  for (const key of change.removeKeys) await cellar.remove(userId, key)
  for (const row of change.put) await cellar.put(userId, row)
}

/** The user's rows, with any pre-v3 open row moved to its own key. */
export async function readSettledCellar(access: CellarAccess): Promise<CellarBottle[]> {
  const rows = await access.cellar.read(access.userId)
  const settle = settleOpenRows(rows, Date.now())
  if (settle.put.length === 0 && settle.removeKeys.length === 0) return rows
  await writeCellarChange(access, settle)
  return applyCellarChange(rows, settle)
}
