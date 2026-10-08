import {
  CELLAR_BOTTLE_SCHEMA_VERSION,
  type CellarBottle,
  MAX_CELLAR_COUNT,
} from '@/lib/schemas/cellar-bottle'

/**
 * The Cellar's rules (design v1.4 §11), as pure functions over one row, so the
 * actions stay thin and every rule has a unit test. Each mirrors the
 * prototype's behaviour exactly; where §11 is silent, the prototype decided.
 */

/**
 * Days open after which a bottle is "best finished this week". §11 says 10,
 * or 5 for *nama*; *nama* is not stored yet (CellarBottle v2, ADR-0024), so
 * every bottle uses 10. Design open decision 4 — the number is the designers'
 * to change, not ours.
 */
export const DRINK_SOON_DAYS = 10

const DAY_MS = 24 * 60 * 60 * 1000

export interface CellarSake {
  brandId: number
  nameKanji: string
  nameRomaji: string | null
}

/** "Add to cellar": a new row of one, or one more bottle on the existing row. */
export function addBottle(
  existing: CellarBottle | undefined,
  sake: CellarSake,
  now: number,
): CellarBottle {
  if (existing) {
    return { ...existing, count: Math.min(MAX_CELLAR_COUNT, existing.count + 1), updatedAt: now }
  }
  return {
    schemaVersion: CELLAR_BOTTLE_SCHEMA_VERSION,
    brandId: sake.brandId,
    sake: { nameKanji: sake.nameKanji, nameRomaji: sake.nameRomaji },
    count: 1,
    openedAt: null,
    addedAt: now,
    updatedAt: now,
  }
}

/** "Open a bottle". Opening a row that already has an open bottle changes nothing. */
export function openBottle(bottle: CellarBottle, now: number): CellarBottle {
  if (bottle.openedAt !== null) return bottle
  return { ...bottle, openedAt: now, updatedAt: now }
}

/**
 * "Finished": the open bottle is gone. With more bottles left, the row stays
 * and they are all sealed; with none left, the row goes (`null`).
 */
export function finishBottle(bottle: CellarBottle, now: number): CellarBottle | null {
  if (bottle.count <= 1) return null
  return { ...bottle, count: bottle.count - 1, openedAt: null, updatedAt: now }
}

/**
 * "Remove" on a sealed row: one bottle fewer — a bottle given away, or added
 * by mistake. The last one takes the row (`null`). The prototype drops the
 * whole row, which left no way to take back a single extra bottle.
 */
export function removeBottle(bottle: CellarBottle, now: number): CellarBottle | null {
  if (bottle.count <= 1) return null
  return { ...bottle, count: bottle.count - 1, updatedAt: now }
}

export type CellarFreshness =
  | { kind: 'unopened' }
  | { kind: 'open'; days: number; drinkSoon: boolean }

/** The row's state line: sealed, or open for `days` whole days. */
export function cellarFreshness(bottle: CellarBottle, now: number): CellarFreshness {
  if (bottle.openedAt === null) return { kind: 'unopened' }
  const days = Math.max(0, Math.floor((now - bottle.openedAt) / DAY_MS))
  return { kind: 'open', days, drinkSoon: days >= DRINK_SOON_DAYS }
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
