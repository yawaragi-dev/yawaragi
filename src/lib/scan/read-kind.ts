import {
  nonSakeDrinkOf,
  type LabelScanExtraction,
  type NonSakeDrink,
} from '@/lib/schemas/label-scan-extraction'

/**
 * The two reads the catalogue is not asked about: a menu, several bottles or
 * no bottle at all (no one bottle to name), and a bottle whose label prints that it is not
 * sake. Both would otherwise go through the lookup and come back as a sake
 * — the maker's, or a namesake — which is worse than no answer.
 *
 * `null` for everything else, including a read that does not say what the
 * drink is: a front label with the name alone is looked up as before.
 *
 * Shared by the scan action and the eval, so the eval judges what the scan
 * does.
 */
export type NotOneBottleOfSake =
  | { kind: 'not_one_bottle'; subject: 'menu' | 'several_bottles' | 'no_bottle' }
  | { kind: 'not_sake'; drink: NonSakeDrink }

export function notOneBottleOfSake(
  extraction: Pick<LabelScanExtraction, 'subject' | 'drink'>,
): NotOneBottleOfSake | null {
  if (
    extraction.subject === 'menu' ||
    extraction.subject === 'several_bottles' ||
    extraction.subject === 'no_bottle'
  ) {
    return { kind: 'not_one_bottle', subject: extraction.subject }
  }
  const drink = nonSakeDrinkOf(extraction)
  return drink ? { kind: 'not_sake', drink } : null
}
