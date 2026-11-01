import {
  nonSakeDrinkOf,
  type LabelScanExtraction,
  type NonSakeDrink,
  type ScanBottleRead,
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

/**
 * Where one read of a label lands: not one bottle of sake, a side with no
 * writing (design v1.7 G — no name to look up, so the catalogue is not
 * asked), or whatever the catalogue lookup answers. The scan action and the
 * eval both land a read through this, so the eval scores what ships.
 *
 * The lookup is passed in to keep this module free of the database.
 */
export type LabelLanding<Resolved extends { kind: string }> = NotOneBottleOfSake | { kind: 'no_text' } | Resolved

export async function landLabel<Resolved extends { kind: string }>(
  extraction: Pick<LabelScanExtraction, 'subject' | 'drink' | 'legibility'>,
  lookUp: () => Promise<Resolved>,
): Promise<LabelLanding<Resolved>> {
  const other = notOneBottleOfSake(extraction)
  if (other) return other
  if (extraction.legibility === 'no_text') return { kind: 'no_text' }
  return lookUp()
}

/**
 * The two-tier rule: the cheap first read stands only on an exact match whose
 * label did not leave the brewery out. Everything else — not sake, not one
 * bottle, no writing, a partial or ambiguous match, nothing found, too unsure,
 * a read that failed — is read again by the better model. "Not sake" and
 * "not one bottle" end a scan without a lookup, so they are the second
 * read's to say; and a name read without its brewery is the read tier 1 got
 * wrong most (Dewazakura's brush kanji as 獺祭, 2026-10-13).
 *
 * `kind` is the landing's, or `failed` when there was no read at all.
 */
export function firstReadStands(kind: string, breweryPrinted: boolean | undefined): boolean {
  return kind === 'exact' && breweryPrinted !== false
}

/**
 * Design v1.7 §5a: two bottles of equal weight are "Which bottle do you
 * mean?", one row per bottle the model could read; three or more are a
 * shelf. The model counts the bottles in the frame and lists the readable
 * ones; this says which case a read is. `null` for anything but two
 * bottles with at least one name read. Shared by the scan and the eval.
 */
export function twoBottleReadsOf(
  extraction: Pick<LabelScanExtraction, 'subject' | 'bottle_count' | 'bottles'>,
): readonly ScanBottleRead[] | null {
  if (extraction.subject !== 'several_bottles' || extraction.bottle_count !== 2) return null
  const bottles = (extraction.bottles ?? []).slice(0, 2)
  return bottles.length > 0 ? bottles : null
}

/**
 * One bottle of a photo of several, as a read of one bottle: its own name,
 * brewery, drink and confidence, nothing from the other bottle. The bottling
 * and other names were read for the photo's most prominent bottle, which may
 * not be this one, so neither is carried.
 */
export function bottleExtraction(photo: LabelScanExtraction, bottle: ScanBottleRead): LabelScanExtraction {
  return {
    source: photo.source,
    subject: 'one_bottle',
    legibility: 'read',
    drink: bottle.drink,
    name_ja: bottle.name_ja,
    brewery_printed: bottle.brewery_printed,
    brewery_ja: bottle.brewery_ja,
    ...(bottle.name_romaji ? { name_romaji: bottle.name_romaji } : {}),
    ...(bottle.brewery_romaji ? { brewery_romaji: bottle.brewery_romaji } : {}),
    confidence: bottle.confidence,
  }
}
