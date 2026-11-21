import { PAIRING_ROWS, type PairingFood, type PairingRowId } from './pairing-table'
import { pairingOf, type PairingDeps, type PairingSubject } from './pairing-of'
import type { Pairing } from './resolve-pairing'

/**
 * The inverse of "Goes with": I'm eating this — which of my bottles goes with
 * it? Drawn on the Cellar segment as "Pick for a dish" (design question AG,
 * layout C: the list re-sorts in place; `CellarDishPick`).
 *
 * Dish groups are the pairing table's own foods, grouped. Every food sits in
 * exactly one group and no group names a food the table lacks, so a dish can
 * only reach what the sources say. "Grilled eel" rather than "grilled fish":
 * unagi is the only grilled fish any source gives.
 *
 * Display names are `pairings.dishes.<id>` (EN and DE). They are the
 * prototype's proposals; design question AG still asks the designers to
 * confirm them.
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
] as const satisfies readonly { id: string; foods: readonly PairingFood[] }[]

export type DishGroupId = (typeof DISH_GROUPS)[number]['id']

// A food the table gains without a group is a compile error here, not a
// dish nobody can pick. (That no food sits in two groups is a unit test.)
type UngroupedFood = Exclude<PairingFood, (typeof DISH_GROUPS)[number]['foods'][number]>
const everyFoodGrouped: [UngroupedFood] extends [never] ? true : UngroupedFood = true
void everyFoodGrouped

export function isDishGroupId(value: unknown): value is DishGroupId {
  return typeof value === 'string' && DISH_GROUPS.some((group) => group.id === value)
}

/** The foods a dish group stands for, in the group's order. */
export function dishFoods(dish: DishGroupId): readonly PairingFood[] {
  return DISH_GROUPS.find((group) => group.id === dish)!.foods
}

/** The table rows a dish group reaches, in table order — for the sources sheet and "Our table gives this dish to…". */
export function rowsForDish(dish: DishGroupId): PairingRowId[] {
  const foods: readonly string[] = dishFoods(dish)
  return PAIRING_ROWS.filter((row) => row.foods.some((food) => foods.includes(food))).map(
    (row) => row.id as PairingRowId,
  )
}

export interface DishMatch<B> {
  bottle: B
  /** The bottle's own answer, so the row can say what picked it and show its provenance. */
  pairing: Pairing
  /** The foods of this dish that the bottle's row gives, in the row's order. */
  foods: string[]
}

export interface DishPick<B> {
  /** Bottles whose row covers the dish. */
  matches: DishMatch<B>[]
  /** Placed by the table, but for other dishes. */
  others: { bottle: B; pairing: Pairing }[]
  /** The table says nothing about these: listed, not hidden. */
  unplaceable: { bottle: B }[]
}

/**
 * Sorts the visitor's bottles for one dish: those that go with it, those the
 * table places with other dishes, and those it cannot place. Each group keeps
 * the order the bottles came in — pass the cellar's own order (drink soon,
 * other open, sealed) and the bottle to finish first leads.
 *
 * Each bottle is read exactly as its page reads it (`pairingOf`), so a match
 * here is the same claim "Goes with" makes there.
 */
export async function bottlesForDish<B>(
  dish: DishGroupId,
  bottles: readonly B[],
  deps: PairingDeps & { subjectOf: (bottle: B) => PairingSubject },
): Promise<DishPick<B>> {
  const pairings = await Promise.all(bottles.map((bottle) => pairingOf(deps.subjectOf(bottle), deps)))
  return sortForDish(
    dish,
    bottles.map((bottle, i) => ({ bottle, pairing: pairings[i] })),
  )
}

/**
 * `bottlesForDish` for bottles whose pairing is already read. Synchronous and
 * free of lookups, so the Cellar can read every bottle once on the server and
 * re-sort in the browser as a dish is tapped.
 */
export function sortForDish<B>(
  dish: DishGroupId,
  placed: readonly { bottle: B; pairing: Pairing | null }[],
): DishPick<B> {
  const wanted: readonly string[] = dishFoods(dish)
  const pick: DishPick<B> = { matches: [], others: [], unplaceable: [] }
  for (const { bottle, pairing } of placed) {
    if (!pairing) {
      pick.unplaceable.push({ bottle })
      continue
    }
    const foods = pairing.row.foods.filter((food) => wanted.includes(food))
    if (foods.length > 0) pick.matches.push({ bottle, pairing, foods })
    else pick.others.push({ bottle, pairing })
  }
  return pick
}
