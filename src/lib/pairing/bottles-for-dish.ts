import { PAIRING_ROWS, type PairingFood, type PairingRowId } from './pairing-table'
import { pairingOf, type PairingDeps, type PairingSubject } from './pairing-of'
import type { Pairing } from './resolve-pairing'

/**
 * The inverse of "Goes with": I'm eating this — which of my bottles goes with
 * it? Not wired to any screen yet; the layout is design question block AG
 * (`docs/design-questions.md`, draft PR #562's prototype).
 *
 * Dish groups are the pairing table's own foods, grouped. Every food sits in
 * exactly one group and no group names a food the table lacks, so a dish can
 * only reach what the sources say. "Grilled eel" rather than "grilled fish":
 * unagi is the only grilled fish any source gives.
 *
 * TODO(design AG): the groups have no display names yet. The prototype's
 * chip names ("Raw fish and shellfish", "Dashi and simmered dishes"…) are
 * proposals awaiting the designers; add `pairings.dishes.<id>` messages (EN
 * and DE) with the screen that shows them, not before.
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
  const wanted: readonly string[] = dishFoods(dish)
  const pairings = await Promise.all(bottles.map((bottle) => pairingOf(deps.subjectOf(bottle), deps)))
  const pick: DishPick<B> = { matches: [], others: [], unplaceable: [] }
  bottles.forEach((bottle, i) => {
    const pairing = pairings[i]
    if (!pairing) {
      pick.unplaceable.push({ bottle })
      return
    }
    const foods = pairing.row.foods.filter((food) => wanted.includes(food))
    if (foods.length > 0) pick.matches.push({ bottle, pairing, foods })
    else pick.others.push({ bottle, pairing })
  })
  return pick
}
