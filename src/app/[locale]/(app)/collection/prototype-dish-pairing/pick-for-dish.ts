/**
 * PROTOTYPE — "Pick a bottle from my cellar for a dish". Throwaway; see
 * NOTES.md next to this file. Not linked from anywhere in the app.
 *
 * The inverse of §9.7 "Goes with": a dish kind → the pairing-table rows whose
 * foods it covers → the cellar bottles whose row (from `resolvePairing`) is
 * one of them. Only the hand-curated table; no model, nothing invented.
 *
 * Pure and client-safe: the page resolves each bottle's row on the server and
 * hands the variants plain data; this file only groups and orders it.
 */
import type { PairingRowId } from '@/lib/pairing/pairing-table'
import type { CellarFreshness } from '@/lib/collection/cellar'

/**
 * Dish kinds, grouped from the food keys already in the pairing table
 * (`pairings.rows.<row>.<food>`). Every food key sits in exactly one group,
 * and no group names a food the table does not have — so "grilled fish" is
 * "grilled eel" here, because unagi is the only grilled fish the sources give.
 */
export const DISH_GROUPS = [
  { id: 'rawSeafood', foods: ['sashimi', 'crab', 'oysters'] },
  { id: 'friedFish', foods: ['friedFish'] },
  { id: 'grilledEel', foods: ['unagi'] },
  { id: 'lightChilled', foods: ['coldTofu'] },
  { id: 'dashiSimmered', foods: ['oden', 'porkDaikon'] },
  { id: 'richMeat', foods: ['sukiyaki', 'foieGras'] },
  { id: 'spicy', foods: ['spicyDishes'] },
  { id: 'cheese', foods: ['freshCheese', 'hardCheese', 'washedRindCheese'] },
  { id: 'sweets', foods: ['darkChocolate', 'iceCream', 'fruitDesserts', 'driedFruit'] },
] as const

export type DishId = (typeof DISH_GROUPS)[number]['id']

export function isDishId(value: unknown): value is DishId {
  return typeof value === 'string' && DISH_GROUPS.some((g) => g.id === value)
}

/** One cellar row, already read: what the variants render. */
export interface ProtoBottle {
  key: string
  name: string
  /** The kanji under a Latin name, when they differ. */
  kanji: string | null
  sizeMl: number | null
  count: number
  nama: boolean
  freshness: CellarFreshness
  /** Position in §11's own order (`sortCellar`): drink soon, open, sealed. */
  cellarOrder: number
  pairing: {
    rowId: PairingRowId
    basis: 'style' | 'grade' | 'chart'
    source: 'manual_curation' | 'sakenowa_inferred'
    /** The grade's display label, when the grade picked the row. */
    grade?: string
    /** The row's foods, in table order. */
    foods: readonly string[]
  } | null
  /** Why the table places it nowhere, when it does not. */
  unplacedReason?: 'styleUnpaired' | 'tooLittle'
}

export interface Match {
  bottle: ProtoBottle
  /** The foods of this dish kind that the bottle's row gives. */
  foods: string[]
}

export interface DishPick {
  matches: Match[]
  /** Placed by the table, but for other dishes. */
  elsewhere: ProtoBottle[]
  /** Placed nowhere: listed honestly, not hidden. */
  unplaced: ProtoBottle[]
}

/**
 * Matches first, in the cellar's own order — an open bottle to finish soon
 * before the other open ones, before the sealed ones. Then the bottles the
 * table puts with other dishes, then the ones it cannot place.
 */
export function pickForDish(bottles: readonly ProtoBottle[], dish: DishId): DishPick {
  const dishFoods: readonly string[] = DISH_GROUPS.find((g) => g.id === dish)!.foods
  const byCellar = [...bottles].sort((a, b) => a.cellarOrder - b.cellarOrder)
  const matches: Match[] = []
  const elsewhere: ProtoBottle[] = []
  const unplaced: ProtoBottle[] = []
  for (const bottle of byCellar) {
    if (!bottle.pairing) {
      unplaced.push(bottle)
      continue
    }
    const foods = bottle.pairing.foods.filter((food) => dishFoods.includes(food))
    if (foods.length > 0) matches.push({ bottle, foods })
    else elsewhere.push(bottle)
  }
  return { matches, elsewhere, unplaced }
}

/** The table rows a dish kind reaches, for the sources sheet. */
export function rowsForDish(rows: readonly { id: string; foods: readonly string[] }[], dish: DishId): string[] {
  const dishFoods: readonly string[] = DISH_GROUPS.find((g) => g.id === dish)!.foods
  return rows.filter((row) => row.foods.some((food) => dishFoods.includes(food))).map((row) => row.id)
}
