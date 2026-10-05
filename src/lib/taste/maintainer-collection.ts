import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import type { CellarStore } from '@/lib/collection/cellar-store'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * The one gate every collection write passes (ADR-0020): an allowlisted
 * maintainer, a resolved Clerk user id, and configured stores. Anything else
 * is `forbidden` (authz) or `unavailable` (config), never a thrown error —
 * the UI renders each state.
 *
 * Not a `'use server'` module: it is a helper the action modules call, and a
 * `'use server'` file may only export the actions themselves.
 */
export type GateFailure = { status: 'forbidden' } | { status: 'unavailable' }

export interface MaintainerCollection {
  userId: string
  journal: JournalStore
  cellar: CellarStore
}

export async function withMaintainerCollection<T>(
  run: (collection: MaintainerCollection) => Promise<T>,
): Promise<T | GateFailure> {
  if (!(await currentUserIsMaintainer())) return { status: 'forbidden' }
  const { userId } = await auth()
  // The gate implies a signed-in user, but resolve defensively rather than `!`.
  if (!userId) return { status: 'forbidden' }
  const journal = getJournalStore()
  const cellar = getCellarStore()
  if (!journal || !cellar) return { status: 'unavailable' }
  return run({ userId, journal, cellar })
}
