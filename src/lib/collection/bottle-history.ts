import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import { describeError, logFailure } from '@/lib/observability/log-failure'
import {
  BOTTLE_EVENT_SCHEMA_VERSION,
  type BottleEvent,
  type BottleEventKind,
} from '@/lib/schemas/bottle-event'
import { type CellarBottle, MAX_CELLAR_COUNT, cellarRowKey } from '@/lib/schemas/cellar-bottle'

/**
 * The bottle history's rules (design question AB, ADR-0024 "Bottle history"):
 * which events a cellar action leaves, and how the history starts.
 *
 * **What is recorded.** Each cellar action compares the rows before and after
 * its change and records what the bottle count did — never what the action
 * meant to do — so a capped add or a no-op tap leaves nothing:
 *
 * - "Add to cellar": `added`, by how many the cellar grew.
 * - "Open a bottle": `opened`, by how many more bottles are open.
 * - "Finished": `finished`; "Remove": `removed`, by how many it shrank.
 * - The sheet editing a row: `added` or `removed` for the change in count,
 *   with the row's size and nama as edited. A change of size or nama alone
 *   records nothing: the same bottles were relabelled, none came or went.
 *
 * Moving a pre-v3 open row to its own key (`settleOpenRows`) and a bottling's
 * rename or delete (which relabel or erase rows) are not cellar actions and
 * record nothing either.
 *
 * **How it starts.** The first time anything is written for a User whose
 * history is empty, the bottles already in their cellar are seeded first:
 * one `added` per row, `count` = the row's count, `at` = its `addedAt`,
 * marked `seeded`. Its id is `seed:<row key>`, so two actions racing to seed
 * write the same events, not twice as many.
 */

/** What an event is about: the row's thing, name, size and kind. */
export type BottleEventSubject = Pick<CellarBottle, 'brandId' | 'expression' | 'sake' | 'sizeMl' | 'nama'>

export function bottleEvent(
  kind: BottleEventKind,
  subject: BottleEventSubject,
  count: number,
  at: number,
  id: string,
): BottleEvent {
  return {
    schemaVersion: BOTTLE_EVENT_SCHEMA_VERSION,
    id,
    at,
    kind,
    count: Math.min(MAX_CELLAR_COUNT, count),
    thing: {
      brandId: subject.brandId,
      ...(subject.expression ? { expression: subject.expression } : {}),
    },
    sake: { nameKanji: subject.sake.nameKanji, nameRomaji: subject.sake.nameRomaji },
    sizeMl: subject.sizeMl,
    nama: subject.nama,
  }
}

/** One seeded `added` per cellar row: the bottles already there when the history began. */
export function seedEvents(rows: readonly CellarBottle[]): BottleEvent[] {
  return rows.map((row) => ({
    ...bottleEvent('added', row, row.count, row.addedAt, `seed:${cellarRowKey(row)}`),
    seeded: true as const,
  }))
}

const bottles = (rows: readonly CellarBottle[]) => rows.reduce((n, r) => n + r.count, 0)
const openBottles = (rows: readonly CellarBottle[]) =>
  rows.reduce((n, r) => n + (r.openedAt === null ? 0 : r.count), 0)

export type CellarActionKind = 'add' | 'open' | 'finish' | 'remove' | 'edit'

/**
 * The events one cellar action leaves, from the rows before and after it.
 * `subject` is the row acted on — for "add" the row the bottles went to, for
 * "edit" the row as edited.
 */
export function eventsForCellarAction(
  action: CellarActionKind,
  before: readonly CellarBottle[],
  after: readonly CellarBottle[],
  subject: BottleEventSubject,
  now: number,
  newId: () => string,
): BottleEvent[] {
  const delta = bottles(after) - bottles(before)
  const event = (kind: BottleEventKind, count: number) =>
    count > 0 ? [bottleEvent(kind, subject, count, now, newId())] : []
  switch (action) {
    case 'add':
      return event('added', delta)
    case 'open':
      return event('opened', openBottles(after) - openBottles(before))
    case 'finish':
      return event('finished', -delta)
    case 'remove':
      return event('removed', -delta)
    case 'edit':
      return delta > 0 ? event('added', delta) : event('removed', -delta)
  }
}

/**
 * Write a cellar action's events, seeding the history first if it is empty.
 * Called after the cellar write succeeded. Never throws: the cellar is what
 * the visitor sees, and a history that could not be written must not turn a
 * saved bottle into "Couldn't save". The failure is logged (anonymous, as
 * `logFailure` requires) and the action still answers ok.
 *
 * `history` is `null` when no store is configured; nothing is recorded then.
 */
export async function recordBottleEvents(
  { userId, history }: { userId: string; history: BottleHistoryStore | null },
  rowsBefore: readonly CellarBottle[],
  events: readonly BottleEvent[],
): Promise<void> {
  if (!history || events.length === 0) return
  try {
    const seed = (await history.size(userId)) === 0 ? seedEvents(rowsBefore) : []
    await history.append(userId, [...seed, ...events])
  } catch (error) {
    logFailure({ where: 'bottle history', ...describeError(error) })
  }
}
