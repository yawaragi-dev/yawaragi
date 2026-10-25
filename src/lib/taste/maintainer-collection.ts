import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { unstable_rethrow } from 'next/navigation'
import { describeError, logFailure } from '@/lib/observability/log-failure'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import type { CellarStore } from '@/lib/collection/cellar-store'
import type { ExpressionStore } from '@/lib/collection/expression-store'
import { getBottleHistoryStore } from '@/lib/collection/get-bottle-history-store'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
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
  expressions: ExpressionStore
  /**
   * The bottle history (ADR-0024 "Bottle history"). Nullable, unlike the
   * others: it is a record kept beside the cellar, not something an action
   * needs to work, so its absence never makes a collection `unavailable`.
   */
  history: BottleHistoryStore | null
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
  const expressions = getExpressionStore()
  if (!journal || !cellar || !expressions) return { status: 'unavailable' }
  try {
    return await run({ userId, journal, cellar, expressions, history: getBottleHistoryStore() })
  } catch (error) {
    // A store that cannot be reached (an Upstash 5xx or 429, a dropped
    // connection, the catalogue's pg pool full) used to escape as a thrown
    // error. Thrown from a Server Action awaited in a transition, it reaches
    // the screen's error boundary, and "Delete tasting" took the whole page
    // down instead of saying "Couldn't save". Every caller already renders
    // `unavailable`, so the failure becomes that, and a log line.
    unstable_rethrow(error)
    logFailure({ where: 'collection action', ...describeError(error) })
    return { status: 'unavailable' }
  }
}
