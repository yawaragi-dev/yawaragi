import 'server-only'

import { unstable_rethrow } from 'next/navigation'
import { isCollectionClosed, type OwnCollection, openCollection } from '@/lib/collection/open-collection'
import { describeError, logFailure } from '@/lib/observability/log-failure'

/**
 * The one gate every collection write passes (ADR-0020): an allowlisted
 * maintainer, a resolved Clerk user id, and configured stores — decided by
 * {@link openCollection}. Anything else is `forbidden` (authz) or
 * `unavailable` (config), never a thrown error — the UI renders each state.
 *
 * Not a `'use server'` module: it is a helper the action modules call, and a
 * `'use server'` file may only export the actions themselves.
 */
export type GateFailure = { status: 'forbidden' } | { status: 'unavailable' }

/** The collection an action writes to: the maintainer's own. */
export type MaintainerCollection = OwnCollection

export async function withMaintainerCollection<T>(
  run: (collection: MaintainerCollection) => Promise<T>,
): Promise<T | GateFailure> {
  const opened = await openCollection()
  // Only the status reaches the caller: an action answers the screen with it.
  if (isCollectionClosed(opened)) return { status: opened.status }
  try {
    return await run(opened)
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
