import 'server-only'

import { auth } from '@clerk/nextjs/server'
import type { cookies } from 'next/headers'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { getBottleHistoryStore } from '@/lib/collection/get-bottle-history-store'
import { getCellarStore } from '@/lib/collection/get-cellar-store'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
import { readSampleJournal, wantsSampleCollection } from '@/lib/demo/sample-mode'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import {
  STUB_JOURNAL_NOW,
  resolveBottleHistoryStub,
  resolveCellarStub,
  resolveExpressionsStub,
  resolveJournalStub,
} from '@/lib/taste/journal-stub'
import { type MaintainerJournalState, resolveMaintainerJournal } from '@/lib/taste/resolve-maintainer-journal'

type CookieJar = Awaited<ReturnType<typeof cookies>>

/** What a viewer's collection is made of; {@link Viewer.read} reads the parts asked for. */
export interface CollectionParts {
  /** The tasting journal, newest first, with the Palate derived from it. */
  journal: MaintainerJournalState
  cellar: readonly CellarBottle[]
  /** The bottlings the viewer added themselves (ADR-0025). */
  expressions: readonly Expression[]
  /** The bottle history (ADR-0024, design v1.10 AB); `null` when it could not be read just now. */
  history: readonly BottleEvent[] | null
}

export type CollectionPart = keyof CollectionParts

/**
 * Who is looking at a collection screen, and what they may do there.
 *
 * - `own` — an allowlisted maintainer (ADR-0020) reading their own collection.
 * - `sample` — a visitor without an account looking through the sample
 *   collection: read-only, and never in front of a maintainer's own.
 * - `stub` — the non-production `yawaragi_journal_stub` cookie, standing in for
 *   the maintainer and the stores so the E2E needs no Clerk session and no
 *   Upstash. Its taps still reach the real actions, which refuse them.
 * - `none` — nothing to show.
 */
export interface Viewer {
  kind: 'own' | 'sample' | 'stub' | 'none'
  /** May write to the journal: the stores answer for this viewer. */
  canLog: boolean
  /** The sample collection: listed, never changed. */
  readOnly: boolean
  /** There is a collection to show: the viewer's own (or the stub's), or the sample. */
  canView: boolean
  /** The instant dates are read against — fixed under the stub, so a relative age does not drift overnight. */
  now: number
  /** Who the offline copy is saved for; `undefined` when nothing may be saved (the sample, nobody). */
  copyOwner: string | null | undefined
  /** The parts asked for, read in parallel. A failed journal, cellar or bottlings read throws; a failed history read is `null`. */
  read<K extends CollectionPart>(...parts: K[]): Promise<Pick<CollectionParts, K>>
}

type Loaders = { [K in CollectionPart]: () => Promise<CollectionParts[K]> }

const NOTHING: Loaders = {
  journal: async () => ({ kind: 'unavailable' }),
  cellar: async () => [],
  expressions: async () => [],
  history: async () => [],
}

function viewer(
  identity: Omit<Viewer, 'read' | 'canView'>,
  loaders: Loaders,
): Viewer {
  return {
    ...identity,
    canView: identity.canLog || identity.readOnly,
    async read<K extends CollectionPart>(...parts: K[]) {
      const values = await Promise.all(parts.map((part) => loaders[part]()))
      return Object.fromEntries(parts.map((part, i) => [part, values[i]])) as unknown as Pick<CollectionParts, K>
    },
  }
}

/**
 * Decides, once per request, who is looking: the stub, the maintainer, the
 * sample, in that order — the order every collection screen used to decide on
 * its own. `now` is read here rather than in a page so the render stays pure.
 */
export async function resolveViewer(cookieJar: CookieJar): Promise<Viewer> {
  const stub = process.env.NODE_ENV !== 'production' ? cookieJar.get('yawaragi_journal_stub')?.value : undefined
  if (stub != null) {
    const journal = resolveJournalStub(stub)
    return viewer(
      { kind: 'stub', canLog: journal.kind !== 'unavailable', readOnly: false, now: STUB_JOURNAL_NOW, copyOwner: null },
      {
        journal: async () => journal,
        cellar: async () => resolveCellarStub(stub),
        expressions: async () => resolveExpressionsStub(stub),
        history: async () => resolveBottleHistoryStub(stub),
      },
    )
  }

  const now = Date.now()
  if (await currentUserIsMaintainer()) {
    const { userId } = await auth()
    const journal = getJournalStore()
    const cellar = getCellarStore()
    const expressions = getExpressionStore()
    const history = getBottleHistoryStore()
    if (!userId) {
      return viewer({ kind: 'own', canLog: false, readOnly: false, now, copyOwner: undefined }, { ...NOTHING, history: async () => null })
    }
    return viewer(
      { kind: 'own', canLog: Boolean(journal && cellar && expressions), readOnly: false, now, copyOwner: userId },
      {
        journal: () => resolveMaintainerJournal({ store: journal, userId, now }),
        cellar: async () => (cellar ? cellar.read(userId) : []),
        expressions: async () => (expressions ? expressions.read(userId) : []),
        history: async () => (history ? history.read(userId).catch(() => null) : null),
      },
    )
  }

  if (wantsSampleCollection(cookieJar)) {
    let sample: ReturnType<typeof readSampleJournal> | undefined
    const read = () => (sample ??= readSampleJournal(now))
    return viewer(
      { kind: 'sample', canLog: false, readOnly: true, now, copyOwner: undefined },
      {
        journal: async () => (await read()).journal,
        cellar: async () => (await read()).cellar,
        expressions: async () => (await read()).expressions,
        history: async () => (await read()).history,
      },
    )
  }

  return viewer({ kind: 'none', canLog: false, readOnly: false, now, copyOwner: undefined }, NOTHING)
}
