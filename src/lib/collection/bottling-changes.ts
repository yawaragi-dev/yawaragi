import { type CellarBottle, MAX_CELLAR_COUNT, cellarRowKey } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * What renaming or deleting a bottling a User added does to the records that
 * point at it (design v1.6.2 §9a, ADR-0025). Pure: each function takes the
 * records as they are and returns the writes to make, so the rules are
 * unit-tested without a store and the actions only carry them out.
 *
 * A tasting and a cellar row each hold a copy of the bottling's name
 * (denormalised, like the sake's), so a rename has to reach them too. With no
 * sake the bottling's name also stands in for the sake's name on both.
 */

/** Writes to make, per store. Removes are by key. */
export interface CollectionWrites {
  putEntries: JournalEntry[]
  removeEntryIds: string[]
  putCellar: CellarBottle[]
  removeCellarKeys: string[]
}

/** The records a bottling's tastings and bottles live in. */
export interface BottlingRecords {
  /** Every journal entry of the user. */
  entries: readonly JournalEntry[]
  /** Every cellar row of the user. */
  cellar: readonly CellarBottle[]
}

const entriesOf = (expression: Expression, entries: readonly JournalEntry[]) =>
  entries.filter((e) => e.expression?.id === expression.id)
const rowsOf = (expression: Expression, cellar: readonly CellarBottle[]) =>
  cellar.filter((r) => r.expression?.id === expression.id)

/** A tasting or a cellar row as the sake's own: the same record, minus the bottling. */
function withoutBottling<T extends { expression?: unknown }>(record: T): Omit<T, 'expression'> {
  const copy = { ...record }
  delete copy.expression
  return copy
}

/** "Rename": the new name, on every tasting and cellar row that carries it. */
export function renameBottlingWrites(
  renamed: Expression,
  { entries, cellar }: BottlingRecords,
  now: number,
): CollectionWrites {
  const ref = { id: renamed.id, name: renamed.name }
  // With no sake the bottling's name stands in for the sake's (JournalEntry v3).
  const standIn = renamed.brandId === null ? { nameKanji: renamed.name, nameRomaji: null } : null
  return {
    putEntries: entriesOf(renamed, entries).map((entry) => ({
      ...entry,
      expression: ref,
      ...(standIn ? { sake: standIn } : {}),
      updatedAt: now,
    })),
    removeEntryIds: [],
    putCellar: rowsOf(renamed, cellar).map((row) => ({
      ...row,
      expression: ref,
      ...(standIn ? { sake: standIn } : {}),
      updatedAt: now,
    })),
    removeCellarKeys: [],
  }
}

/** How many tastings and bottles a delete touches — the dialog states both. */
export function bottlingHoldings(
  expression: Expression,
  { entries, cellar }: BottlingRecords,
): { tastings: number; bottles: number } {
  return {
    tastings: entriesOf(expression, entries).length,
    bottles: rowsOf(expression, cellar).reduce((n, row) => n + row.count, 0),
  }
}

/**
 * Everything "Undo" needs to put a deleted bottling back exactly as it was:
 * the bottling, its tastings and cellar rows before the delete, and the sake's
 * own cellar rows the delete folded bottles into — or the keys of rows the
 * delete created, which Undo takes away again.
 */
export interface DeletedBottling {
  expression: Expression
  entries: JournalEntry[]
  cellar: CellarBottle[]
  createdCellarKeys: string[]
}

/**
 * "Delete bottling" (design v1.6.2, decision 1).
 *
 * - **With a sake**, its tastings and cellar bottles fall back to the sake:
 *   the tastings lose the bottling and keep everything else, and the bottles
 *   join the sake's own row.
 * - **With no sake**, there is nowhere for them to fall back to: they go with
 *   the bottling.
 *
 * Returns the writes and the {@link DeletedBottling} that undoes them.
 */
export function deleteBottlingWrites(
  expression: Expression,
  { entries, cellar }: BottlingRecords,
  now: number,
): { writes: CollectionWrites; undo: DeletedBottling } {
  const tastings = entriesOf(expression, entries)
  const rows = rowsOf(expression, cellar)
  const rowKeys = rows.map(cellarRowKey)

  if (expression.brandId === null) {
    return {
      writes: {
        putEntries: [],
        removeEntryIds: tastings.map((e) => e.id),
        putCellar: [],
        removeCellarKeys: rowKeys,
      },
      undo: { expression, entries: tastings, cellar: rows, createdCellarKeys: [] },
    }
  }

  // Fold each of the bottling's rows into the sake's row of the same kind.
  const sakeRows = new Map<string, CellarBottle>()
  const touchedBefore: CellarBottle[] = []
  const createdCellarKeys: string[] = []
  for (const row of rows) {
    const asSake = withoutBottling(row)
    const key = cellarRowKey(asSake)
    const existing = sakeRows.get(key) ?? cellar.find((r) => cellarRowKey(r) === key)
    if (!existing) {
      createdCellarKeys.push(key)
      sakeRows.set(key, { ...asSake, updatedAt: now })
      continue
    }
    if (!sakeRows.has(key)) touchedBefore.push(existing)
    sakeRows.set(key, {
      ...existing,
      count: Math.min(MAX_CELLAR_COUNT, existing.count + row.count),
      // One open bottle per row: the sake's own stays the open one.
      openedAt: existing.openedAt ?? row.openedAt,
      updatedAt: now,
    })
  }

  return {
    writes: {
      putEntries: tastings.map((entry) => ({ ...withoutBottling(entry), updatedAt: now })),
      removeEntryIds: [],
      putCellar: [...sakeRows.values()],
      removeCellarKeys: rowKeys,
    },
    undo: {
      expression,
      entries: tastings,
      cellar: [...rows, ...touchedBefore],
      createdCellarKeys,
    },
  }
}
