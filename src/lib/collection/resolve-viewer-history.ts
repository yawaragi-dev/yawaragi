import 'server-only'

import { auth } from '@clerk/nextjs/server'
import type { cookies } from 'next/headers'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { getBottleHistoryStore } from '@/lib/collection/get-bottle-history-store'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
import { readSampleCollection, wantsSampleCollection } from '@/lib/demo/sample-mode'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import { STUB_JOURNAL_NOW, resolveBottleHistoryStub, resolveExpressionsStub } from '@/lib/taste/journal-stub'

type CookieJar = Awaited<ReturnType<typeof cookies>>

export interface ViewerHistory {
  history: readonly BottleEvent[]
  /** Ids of the visitor's own bottlings that still exist: a row of a deleted one opens its sake's page. */
  bottlingIds: ReadonlySet<string>
  /** The store could not be read just now: the screen says so rather than listing nothing. */
  unavailable: boolean
  /** The sample collection: listed, never changed. */
  readOnly: boolean
  /** The instant dates are read against (a fixed one under the E2E stub). */
  now: number
}

/**
 * The bottle history on screen for this viewer — for "Bottles you've had"
 * (design v1.10, AB6): the non-production stub, the maintainer's own
 * (ADR-0020), or the sample collection, in the order Collection resolves
 * them; `null` for anyone with no collection to show.
 *
 * `now` is read here rather than in the page so the render stays pure.
 */
export async function resolveViewerHistory(cookieJar: CookieJar): Promise<ViewerHistory | null> {
  const stub = process.env.NODE_ENV !== 'production' ? cookieJar.get('yawaragi_journal_stub')?.value : undefined
  if (stub != null) {
    return {
      history: resolveBottleHistoryStub(stub),
      bottlingIds: new Set(resolveExpressionsStub(stub).map((e) => e.id)),
      unavailable: false,
      readOnly: false,
      now: STUB_JOURNAL_NOW,
    }
  }
  const now = Date.now()
  if (await currentUserIsMaintainer()) {
    const { userId } = await auth()
    const historyStore = getBottleHistoryStore()
    const expressionStore = getExpressionStore()
    if (!userId || !historyStore) {
      return { history: [], bottlingIds: new Set(), unavailable: true, readOnly: false, now }
    }
    const [history, expressions] = await Promise.all([
      historyStore.read(userId).catch(() => null),
      expressionStore ? expressionStore.read(userId).catch(() => []) : Promise.resolve([]),
    ])
    return {
      history: history ?? [],
      bottlingIds: new Set(expressions.map((e) => e.id)),
      unavailable: history === null,
      readOnly: false,
      now,
    }
  }
  if (wantsSampleCollection(cookieJar)) {
    const sample = await readSampleCollection(now)
    return {
      history: sample.history,
      bottlingIds: new Set(sample.expressions.map((e) => e.id)),
      unavailable: false,
      readOnly: true,
      now,
    }
  }
  return null
}
