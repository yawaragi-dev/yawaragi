import { photoKind, type Drink, type PhotoSubject } from './schemas'

/**
 * Where a scan landed, judged against what the photo shows.
 *
 * A photo of one sake bottle has one right answer: its catalogue row, or no
 * match when the catalogue lacks it. The three other kinds of photo do not,
 * so each states its own:
 *
 * - **A bottle that is not sake** (shochu, awamori, …). Right is no sake at
 *   all. The catalogue is sake only, so any sake shown is a sake the visitor
 *   is not holding. A few such products are nevertheless listed in Sakenowa
 *   (`expectedBrandIds` names the row); landing there is `in_photo` — the
 *   name is the bottle's, the flavor data shown beside it is not sake data.
 * - **A menu.** Right, while menu scan is not built, is no single sake: the
 *   result screen presents one bottle, and a menu is not one. A single
 *   answer that is on the menu is `in_photo`, not `right`.
 * - **Several bottles.** If one is clearly the subject (`main`), it is judged
 *   as that bottle alone, and another bottle from the photo is `in_photo`.
 *   If none is, right is no single sake, for the reason a menu's is: picking
 *   one of two equal bottles tells the visitor something they did not ask.
 *
 * Pure, so the rules above are unit-tested; the runner supplies the landing.
 */
export type Verdict = 'right' | 'in_list' | 'in_photo' | 'wrong' | 'none'

/** What the lookup returned, reduced to what a verdict needs. */
export type Landing =
  | { kind: 'none' }
  | { kind: 'one'; brandId: number }
  | { kind: 'list'; brandIds: readonly number[] }

/** The part of a ground-truth entry a verdict depends on. */
export interface Judged {
  subject?: PhotoSubject
  drink?: Drink
  expectedBrandIds?: readonly number[]
  items?: readonly { expectedBrandIds: readonly number[]; main?: boolean }[]
}

/** True when the entry says enough to judge where a scan landed. */
export function canJudge(entry: Judged): boolean {
  return photoKind(entry) === 'sake_bottle' || photoKind(entry) === 'other_drink'
    ? entry.expectedBrandIds !== undefined
    : (entry.items?.length ?? 0) > 0
}

export function judgeLanding(entry: Judged, landing: Landing): Verdict {
  const kind = photoKind(entry)

  if (kind === 'sake_bottle') return judgeTarget(entry.expectedBrandIds ?? [], [], landing)

  if (kind === 'several_bottles') {
    const items = entry.items ?? []
    const main = items.find((item) => item.main)
    if (main) {
      const others = items.filter((item) => item !== main).flatMap((item) => item.expectedBrandIds)
      return judgeTarget(main.expectedBrandIds, others, landing)
    }
  }

  // No single sake is the answer: a bottle that is not sake, a menu, or
  // several bottles sharing the frame.
  const inPhoto = kind === 'other_drink' ? (entry.expectedBrandIds ?? []) : (entry.items ?? []).flatMap((i) => i.expectedBrandIds)
  if (landing.kind === 'none') return 'right'
  if (landing.kind === 'one') return inPhoto.includes(landing.brandId) ? 'in_photo' : 'wrong'
  return landing.brandIds.some((id) => inPhoto.includes(id)) ? 'in_list' : 'wrong'
}

/** One bottle is the answer: `target` are its rows, `[]` when the catalogue has none. */
function judgeTarget(target: readonly number[], alsoInPhoto: readonly number[], landing: Landing): Verdict {
  if (landing.kind === 'none') return target.length === 0 ? 'right' : 'none'
  if (landing.kind === 'one') {
    if (target.includes(landing.brandId)) return 'right'
    return alsoInPhoto.includes(landing.brandId) ? 'in_photo' : 'wrong'
  }
  return landing.brandIds.some((id) => target.includes(id) || alsoInPhoto.includes(id)) ? 'in_list' : 'wrong'
}
