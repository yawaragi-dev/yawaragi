'use server'

import {
  type BottleEventSubject,
  type CellarActionKind,
  eventsForCellarAction,
  recordBottleEvents,
} from '@/lib/collection/bottle-history'
import {
  type CellarChange,
  type CellarSubject,
  addBottles,
  applyCellarChange,
  bottlesOf,
  editRow,
  finishOne,
  newCellarRow,
  openOne,
  removeOne,
} from '@/lib/collection/cellar'
import { readSettledCellar, writeCellarChange } from '@/lib/collection/settled-cellar'
import { type CellarBottle, cellarRowKey } from '@/lib/schemas/cellar-bottle'
import {
  CellarRowKeySchema,
  type CellarSheetValues,
  CellarSheetValuesSchema,
  type CellarTarget,
  CellarTargetSchema,
} from '@/lib/schemas/cellar-input'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { type MaintainerCollection, withMaintainerCollection } from '@/lib/taste/maintainer-collection'
import { countUsage } from '@/lib/stats/count-usage'

/**
 * The Cellar's write actions (design v1.4 §11, v1.6.2; ADR-0024): add bottles
 * from the sheet, open one, finish one, remove one, edit a row. Each reads the
 * user's rows, works out the change with the pure rules in `cellar.ts`, and
 * writes it — behind the same maintainer gate as the journal (ADR-0020). Not
 * rate-limited, for the journal actions' reason.
 *
 * Adding names a {@link CellarTarget} — a sake, or a bottling — because the
 * row may not exist yet. Everything else names the row it acts on by its key.
 *
 * `count` in a result is how many bottles of that thing are in the cellar
 * afterwards, across sizes and open or not: what "In cellar · n" shows.
 *
 * After the cellar write, each action records what it did to the bottle count
 * in the bottle history (`bottle-history.ts`). That write is best-effort: it
 * never fails the action.
 */
export type CellarActionResult =
  | { status: 'ok'; count: number }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

/** What a target's rows hold bottles of, or `null` if there is no such thing. */
async function subjectOf(
  target: CellarTarget,
  { userId, expressions }: MaintainerCollection,
  rows: readonly CellarBottle[],
): Promise<CellarSubject | null> {
  if ('expressionId' in target) {
    // The bottling has to be the caller's own.
    const bottling = (await expressions.read(userId)).find((e) => e.id === target.expressionId)
    if (!bottling) return null
    return {
      brandId: bottling.brandId,
      // With no sake the bottling's own name stands in, as in a JournalEntry.
      nameKanji: bottling.line?.nameKanji ?? bottling.name,
      nameRomaji: bottling.line?.nameRomaji ?? null,
      expression: { id: bottling.id, name: bottling.name },
    }
  }
  // A row of this sake already knows its name; no lookup needed.
  const known = rows.find((r) => r.brandId === target.brandId && !r.expression)
  if (known) return { brandId: target.brandId, ...known.sake }
  const brand = await lookupBrand(target.brandId)
  if (!brand) return null
  return { brandId: brand.brandId, nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji }
}

/** The sheet's "Add to cellar": `count` sealed bottles of this size and kind. */
export async function addToCellar(
  target: CellarTarget,
  values: CellarSheetValues,
): Promise<CellarActionResult> {
  const parsedTarget = CellarTargetSchema.safeParse(target)
  const parsedValues = CellarSheetValuesSchema.safeParse(values)
  if (!parsedTarget.success || !parsedValues.success) return { status: 'invalid_input' }
  const { count, sizeMl, nama } = parsedValues.data

  return withMaintainerCollection(async (collection) => {
    const rows = await readSettledCellar(collection)
    const subject = await subjectOf(parsedTarget.data, collection, rows)
    if (!subject) return { status: 'not_found' }
    const now = Date.now()
    const change = addBottles(rows, subject, { sizeMl, nama }, count, now)
    await writeCellarChange(collection, change)
    countUsage('cellar_added')
    const after = applyCellarChange(rows, change)
    const added = newCellarRow(subject, { sizeMl, nama }, count, now)
    await record(collection, 'add', rows, after, added, now)
    return { status: 'ok', count: bottlesOf(after, parsedTarget.data) }
  })
}

/** "Open a bottle". */
export async function openCellarBottle(rowKey: string): Promise<CellarActionResult> {
  return onRow(rowKey, 'open', openOne)
}

/** "Finished": the open bottle is gone. */
export async function finishCellarBottle(rowKey: string): Promise<CellarActionResult> {
  return onRow(rowKey, 'finish', finishOne)
}

/** "Remove": one sealed bottle fewer; the last one takes the row. */
export async function removeFromCellar(rowKey: string): Promise<CellarActionResult> {
  return onRow(rowKey, 'remove', removeOne)
}

/** The sheet, editing a row: a new count, size or nama. */
export async function editCellarRow(
  rowKey: string,
  values: CellarSheetValues,
): Promise<CellarActionResult> {
  const parsed = CellarSheetValuesSchema.safeParse(values)
  if (!parsed.success) return { status: 'invalid_input' }
  return onRow(rowKey, 'edit', (rows, key, now) => editRow(rows, key, parsed.data, now), {
    sizeMl: parsed.data.sizeMl,
    nama: parsed.data.nama,
  })
}

async function onRow(
  rowKey: string,
  action: Exclude<CellarActionKind, 'add'>,
  rule: (rows: readonly CellarBottle[], rowKey: string, now: number) => CellarChange,
  /** For an edit: the size and kind the row has afterwards. */
  edited?: Pick<CellarBottle, 'sizeMl' | 'nama'>,
): Promise<CellarActionResult> {
  const key = CellarRowKeySchema.safeParse(rowKey)
  if (!key.success) return { status: 'invalid_input' }
  return withMaintainerCollection(async (collection) => {
    const rows = await readSettledCellar(collection)
    const row = rows.find((r) => cellarRowKey(r) === key.data)
    if (!row) return { status: 'not_found' }
    const now = Date.now()
    const change = rule(rows, key.data, now)
    await writeCellarChange(collection, change)
    const after = applyCellarChange(rows, change)
    await record(collection, action, rows, after, { ...row, ...edited }, now)
    const thing = row.expression ? { expressionId: row.expression.id } : { brandId: row.brandId! }
    return { status: 'ok', count: bottlesOf(after, thing) }
  })
}

/** The action's events into the bottle history, after the cellar write. Never throws. */
async function record(
  collection: MaintainerCollection,
  action: CellarActionKind,
  before: readonly CellarBottle[],
  after: readonly CellarBottle[],
  subject: BottleEventSubject,
  now: number,
): Promise<void> {
  const events = eventsForCellarAction(action, before, after, subject, now, () => crypto.randomUUID())
  await recordBottleEvents(collection, before, events)
}
