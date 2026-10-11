import {
  CELLAR_BOTTLE_SCHEMA_VERSION,
  type CellarBottle,
  type CellarSize,
  MAX_CELLAR_COUNT,
  cellarIdentityKey,
  cellarRowKey,
} from '@/lib/schemas/cellar-bottle'

/**
 * The Cellar's rules (design v1.4 §11, v1.6.1, v1.6.2), as pure functions over
 * the user's rows, so the actions stay thin and every rule has a unit test.
 *
 * **Rows.** One row per thing + size + nama (v1.6.2), and an open bottle on a
 * row of its own beside the sealed ones — "an opened row is never merged
 * into". So for one identity there are at most two rows: the sealed bottles,
 * and the open one.
 *
 * Each function takes the rows as they are and returns a {@link CellarChange}:
 * the rows to write and the keys to remove. Keys are `cellarRowKey`.
 */

/**
 * Days open after which a bottle is "best finished this week": 10, or 5 for
 * *nama* (§11). Design open decision 4 — the numbers are the designers' to
 * change, not ours.
 */
export const DRINK_SOON_DAYS = 10
export const DRINK_SOON_DAYS_NAMA = 5

const DAY_MS = 24 * 60 * 60 * 1000

/** What a cellar row holds bottles of: a sake, or one bottling (ADR-0025). */
export interface CellarSubject {
  /** The sake, or the line the bottling belongs to; `null` when it has none. */
  brandId: number | null
  nameKanji: string
  nameRomaji: string | null
  /** The bottling, when the bottles are of one. */
  expression?: { id: string; name: string }
}

/** What the "Add to cellar" sheet sets beside the count. */
export interface CellarKind {
  sizeMl: CellarSize | null
  nama: boolean
}

export interface CellarChange {
  put: CellarBottle[]
  removeKeys: string[]
}

const NO_CHANGE: CellarChange = { put: [], removeKeys: [] }
const find = (rows: readonly CellarBottle[], key: string) => rows.find((r) => cellarRowKey(r) === key)
const clamp = (count: number) => Math.min(MAX_CELLAR_COUNT, count)

/** A new sealed row. */
export function newCellarRow(
  subject: CellarSubject,
  kind: CellarKind,
  count: number,
  now: number,
): CellarBottle {
  return {
    schemaVersion: CELLAR_BOTTLE_SCHEMA_VERSION,
    brandId: subject.brandId,
    ...(subject.expression ? { expression: subject.expression } : {}),
    sake: { nameKanji: subject.nameKanji, nameRomaji: subject.nameRomaji },
    sizeMl: kind.sizeMl,
    nama: kind.nama,
    count: clamp(count),
    openedAt: null,
    addedAt: now,
    updatedAt: now,
  }
}

/**
 * Rows written before v3 kept the open bottle on the same row as the sealed
 * ones, under the sealed key. This moves each such row to where the rules
 * below expect it: the open bottle on its own `|open` row, the rest sealed.
 * Every action runs it first. It only ever touches rows with no size — the
 * ones from before the sheet — so it costs nothing once those are gone.
 *
 * An open row with no sealed sibling is either one of those or already in
 * place with nothing sealed beside it; clearing the sealed key is right in
 * both cases, because nothing sealed is there.
 */
export function settleOpenRows(rows: readonly CellarBottle[], now: number): CellarChange {
  const change: CellarChange = { put: [], removeKeys: [] }
  for (const row of rows) {
    if (row.openedAt === null) continue
    // Only a row from before the sheet can be out of place: every bottle added
    // since has a size, and was written where it belongs.
    if (row.sizeMl !== null || row.nama) continue
    const sealedKey = cellarIdentityKey(row)
    if (row.count === 1 && find(rows, sealedKey) !== undefined) continue
    if (row.count === 1 && find(rows, sealedKey) === undefined) {
      // In place, or a one-bottle row still under the old key: writing it at
      // its own key and clearing the sealed one covers both.
      change.removeKeys.push(sealedKey)
      change.put.push(row)
      continue
    }
    // Several bottles, one of them open: split.
    change.removeKeys.push(sealedKey)
    change.put.push({ ...row, count: 1, updatedAt: now })
    change.put.push({ ...row, count: row.count - 1, openedAt: null, updatedAt: now })
  }
  return change
}

/** The rows as they stand after a change. */
export function applyCellarChange(rows: readonly CellarBottle[], change: CellarChange): CellarBottle[] {
  const gone = new Set(change.removeKeys)
  const written = new Map(change.put.map((row) => [cellarRowKey(row), row]))
  return [...rows.filter((r) => !gone.has(cellarRowKey(r)) && !written.has(cellarRowKey(r))), ...written.values()]
}

/**
 * "Add to cellar": `count` more sealed bottles of this thing, size and kind.
 * A matching sealed row grows; an open one is never merged into.
 */
export function addBottles(
  rows: readonly CellarBottle[],
  subject: CellarSubject,
  kind: CellarKind,
  count: number,
  now: number,
): CellarChange {
  const fresh = newCellarRow(subject, kind, count, now)
  const existing = find(rows, cellarRowKey(fresh))
  if (!existing) return { put: [fresh], removeKeys: [] }
  return { put: [{ ...existing, count: clamp(existing.count + count), updatedAt: now }], removeKeys: [] }
}

/** One bottle fewer on a row; the last one takes the row. */
function takeOne(row: CellarBottle, now: number): CellarChange {
  if (row.count <= 1) return { put: [], removeKeys: [cellarRowKey(row)] }
  return { put: [{ ...row, count: row.count - 1, updatedAt: now }], removeKeys: [] }
}

/**
 * "Open a bottle": one bottle leaves the sealed row for the open row. If a
 * bottle of the same kind is already open, the two share that row and the
 * earlier date — the clock is for the bottle open longest.
 */
export function openOne(rows: readonly CellarBottle[], rowKey: string, now: number): CellarChange {
  const sealed = find(rows, rowKey)
  if (!sealed || sealed.openedAt !== null) return NO_CHANGE
  const rest = takeOne(sealed, now)
  const openRow = find(rows, `${rowKey}|open`)
  const opened: CellarBottle = openRow
    ? { ...openRow, count: clamp(openRow.count + 1), updatedAt: now }
    : { ...sealed, count: 1, openedAt: now, addedAt: sealed.addedAt, updatedAt: now }
  return { put: [...rest.put, opened], removeKeys: rest.removeKeys }
}

/** "Finished": the open bottle is gone. */
export function finishOne(rows: readonly CellarBottle[], rowKey: string, now: number): CellarChange {
  const open = find(rows, rowKey)
  if (!open || open.openedAt === null) return NO_CHANGE
  return takeOne(open, now)
}

/** "Remove" on a sealed row: one bottle fewer — given away, or added by mistake. */
export function removeOne(rows: readonly CellarBottle[], rowKey: string, now: number): CellarChange {
  const sealed = find(rows, rowKey)
  if (!sealed || sealed.openedAt !== null) return NO_CHANGE
  return takeOne(sealed, now)
}

/**
 * The sheet, editing a row: a new count, size or nama. Changing size or nama
 * changes what the row is, so it moves — and joins a row of that kind if
 * there already is one.
 */
export function editRow(
  rows: readonly CellarBottle[],
  rowKey: string,
  next: CellarKind & { count: number },
  now: number,
): CellarChange {
  const row = find(rows, rowKey)
  if (!row) return NO_CHANGE
  const edited: CellarBottle = {
    ...row,
    sizeMl: next.sizeMl,
    nama: next.nama,
    count: clamp(next.count),
    updatedAt: now,
  }
  const newKey = cellarRowKey(edited)
  if (newKey === rowKey) return { put: [edited], removeKeys: [] }
  const target = find(rows, newKey)
  return {
    put: [target ? { ...target, count: clamp(target.count + edited.count), updatedAt: now } : edited],
    removeKeys: [rowKey],
  }
}

/** How many bottles of one thing are in the cellar, across sizes, open or not. */
export function bottlesOf(
  rows: readonly CellarBottle[],
  thing: { brandId: number } | { expressionId: string },
): number {
  return rows
    .filter((r) =>
      'expressionId' in thing
        ? r.expression?.id === thing.expressionId
        : r.brandId === thing.brandId && !r.expression,
    )
    .reduce((n, r) => n + r.count, 0)
}

export type CellarFreshness =
  | { kind: 'unopened' }
  | { kind: 'open'; days: number; drinkSoon: boolean }

/** The row's state line: sealed, or open for `days` whole days. */
export function cellarFreshness(bottle: CellarBottle, now: number): CellarFreshness {
  if (bottle.openedAt === null) return { kind: 'unopened' }
  const days = Math.max(0, Math.floor((now - bottle.openedAt) / DAY_MS))
  const limit = bottle.nama ? DRINK_SOON_DAYS_NAMA : DRINK_SOON_DAYS
  return { kind: 'open', days, drinkSoon: days >= limit }
}

/**
 * §11's order: bottles to drink soon first, then the other open ones, then the
 * sealed ones; newest addition first within each group.
 */
export function sortCellar(rows: readonly CellarBottle[], now: number): CellarBottle[] {
  const rank = (b: CellarBottle): number => {
    const f = cellarFreshness(b, now)
    if (f.kind === 'unopened') return 2
    return f.drinkSoon ? 0 : 1
  }
  return [...rows].sort((a, b) => rank(a) - rank(b) || b.addedAt - a.addedAt)
}

/** "{bottles} bottles · {open} open". */
export function cellarSummary(rows: readonly CellarBottle[]): { bottles: number; open: number } {
  return {
    bottles: rows.reduce((n, b) => n + b.count, 0),
    open: rows.filter((b) => b.openedAt !== null).length,
  }
}
