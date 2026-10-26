import 'server-only'
import { debugAdd } from '@/lib/debug/debug-log'
import type { Brand } from '@/lib/schemas/brand'
import { expandBrandVariants, expandBreweryVariants } from './brewery-variants'
import type { Brewery } from '@/lib/schemas/brewery'
import { latinBreweryAgrees, namesOverlapping } from './label-match-rules'
import { romajiKey } from './romaji-key'
import {
  type ResolveScannedLabelResult,
  type ScannedLabel,
  type ScannedLabelLookupExecutor,
  containsNoJapaneseScript,
  isPlaceholderExtraction,
  latinKeys,
  namesBrand,
  otherNamesOf,
  poolExecutor,
  resolveScannedLabel,
} from './resolve-scanned-label'
import { getServerDbPool } from '@/lib/supabase/server-client'

// ---------- resolveWithEarlierRead (#408) ----------
//
// A visitor whose scan did not land on one sake often photographs another
// side of the bottle. Each photo is half an answer — a front label with the
// brand and no brewery, a back label with the brewery and the brand only in
// Latin — and this is where the two halves meet.
//
// Nothing says the second photo is the same bottle, even when the visitor
// meant it to be: they may have moved on to the next one on the shelf. So
// the earlier read is never trusted on its own, and the order is fixed:
//
//   1. The second photo is read blind. Nothing here reaches the vision call.
//   2. Whenever the second read alone gives one sake, that stands. This
//      function is not called for it, and returns null if it is.
//   3. The earlier read is used only when the two are shown to be the same
//      bottle: they share a brand, in any script, or a brewery.
//   4. It fills a gap and never overrides. The second read's name stays the
//      name; the earlier read supplies names to choose a line by, or the
//      brewery where the second read's own found nothing.
//   5. What comes out is a guess that rests on two photos. The caller shows
//      it beside the second photo's own outcome, never in place of it.

type Resolved = Exclude<ResolveScannedLabelResult, { kind: 'low_confidence' }>
type OneSake = Extract<Resolved, { sake: Brand }>

const isOneSake = (r: ResolveScannedLabelResult): r is OneSake =>
  r.kind === 'exact' || r.kind === 'matched_brand_only' || r.kind === 'matched_brewery_only'

/** Every name a read printed for the sake, the chosen one first. */
function namesOf(label: ScannedLabel): string[] {
  return [label.name_ja, ...otherNamesOf(label)].filter((n) => n.trim() !== '' && !isPlaceholderExtraction(n))
}

/** The same name, whole for whole: the same kanji, or the same sound in kana or Latin. */
function sameName(a: string, b: string): boolean {
  if (expandBrandVariants(a).includes(b) || expandBrandVariants(b).includes(a)) return true
  const keys = latinKeys(b)
  return latinKeys(a).some((key) => keys.includes(key))
}

function sameBreweryAsRead(a: string, b: string): boolean {
  if (isPlaceholderExtraction(a) || isPlaceholderExtraction(b)) return false
  const [aLatin, bLatin] = [containsNoJapaneseScript(a), containsNoJapaneseScript(b)]
  if (aLatin && bLatin) return latinBreweryAgrees(a, b)
  if (aLatin || bLatin) return false
  const variants = expandBreweryVariants(b)
  return expandBreweryVariants(a).some((v) => variants.includes(v))
}

/** The one brewery a result points at; none for a list that spans several. */
function breweryIdOf(resolved: ResolveScannedLabelResult): number | null {
  if (isOneSake(resolved)) return resolved.sake.breweryId
  if (resolved.kind !== 'ambiguous') return null
  const ids = new Set(resolved.candidates.map((c) => c.brewery.breweryId))
  return ids.size === 1 ? [...ids][0] : null
}

/**
 * Rule 3: are the two reads one bottle? They are when they share a field —
 * a name either read printed, or the brewery, as read or as found in the
 * catalogue. A grade or a slogan the model listed as a name is a weak link,
 * which is why a shared field only permits borrowing; it decides nothing.
 */
function sameBottle(
  second: ScannedLabel,
  secondOwn: ResolveScannedLabelResult,
  first: ScannedLabel,
  firstOwn: ResolveScannedLabelResult,
): 'brand' | 'brewery' | null {
  const [secondNames, firstNames] = [namesOf(second), namesOf(first)]
  if (secondNames.some((a) => firstNames.some((b) => sameName(a, b)))) return 'brand'
  if (isOneSake(firstOwn)) {
    // Whole name, or a name cut off by the frame: 吉野杉の of 吉野杉の樽酒.
    const { sake } = firstOwn
    if (secondNames.some((n) => namesBrand(n, sake) || namesOverlapping(n, [sake.nameKanji]).length === 1)) return 'brand'
  }
  if (secondOwn.kind === 'ambiguous') {
    const listed = secondOwn.candidates.map((c) => c.sake)
    if (firstNames.some((n) => listed.some((sake) => namesBrand(n, sake)))) return 'brand'
  }

  if (sameBreweryAsRead(second.brewery_ja, first.brewery_ja)) return 'brewery'
  const [a, b] = [breweryIdOf(secondOwn), breweryIdOf(firstOwn)]
  return a !== null && a === b ? 'brewery' : null
}

/** Brand and brewery both point at this one row (see `resolveScannedLabel`'s gate). */
function bothFieldsAgree(resolved: ResolveScannedLabelResult): boolean {
  if (resolved.kind === 'exact') return true
  return (
    resolved.kind === 'matched_brewery_only' &&
    namesOverlapping(resolved.brandDivergence.extracted, [resolved.brandDivergence.stored]).length === 1
  )
}

/**
 * Is the name a read chose just the maker's own — NINKI under 人気酒造? Then
 * a list of that brewery's lines is the right question, and another photo
 * may answer it. A name that is neither a listed line nor the house name is
 * a sake of its own, and no other photo's name stands in for it.
 */
function isHouseName(name: string, brewery: Brewery): boolean {
  if (brewery.nameKanji.includes(name)) return true
  const stored = romajiKey(brewery.nameRomaji ?? '')
  return latinKeys(name).some((key) => stored.includes(key))
}

/**
 * A sake the second read reaches only with the earlier read's help, or null.
 *
 * Three ways, and no fourth:
 *
 * - The model scored the second read low, so it was turned away, yet one of
 *   its fields finds a sake — and the earlier photo, by itself, found the
 *   same one or prints its name. Two photos agreeing is what the read lacked.
 * - The second read names only the maker and so gave a list of its lines; a
 *   name from the earlier photo is one of them. A back label with the house
 *   mark alone, and the front label that says which line.
 * - The two reads share a brand, and the second read's name under the
 *   earlier read's brewery is one catalogue row. A front label with no
 *   brewery on it, and the back label that names the maker.
 *
 * A name from the earlier read is never looked up as the name. That is what
 * would put the last bottle's sake on a new bottle.
 *
 * `secondOwn` is what the second read resolved to by itself. `executor`
 * defaults to the catalogue on the app's pool; unit tests pass a fake one.
 */
export async function resolveWithEarlierRead(
  second: ScannedLabel,
  secondOwn: ResolveScannedLabelResult,
  first: ScannedLabel,
  executor: ScannedLabelLookupExecutor = poolExecutor(getServerDbPool()),
): Promise<{ sake: Brand } | null> {
  if (isOneSake(secondOwn)) return null
  const found = (sake: Brand, how: string) => {
    debugAdd('ScanAction', `both photos together point at "${sake.nameKanji}" (${how})`, { brandId: sake.brandId })
    return { sake }
  }

  const firstOwn = await resolveScannedLabel(first, executor)
  const firstNames = namesOf(first)
  // A read the model scored low is turned away before its shape is known.
  // The earlier read is a second witness, so look at the shape here.
  const shape =
    secondOwn.kind === 'low_confidence' ? await resolveScannedLabel({ ...second, confidence: 1 }, executor) : secondOwn

  if (isOneSake(shape)) {
    const { sake } = shape
    const sameSake = isOneSake(firstOwn) && firstOwn.sake.brandId === sake.brandId
    return sameSake || firstNames.some((name) => namesBrand(name, sake))
      ? found(sake, 'each photo finds it by itself')
      : null
  }

  const shared = sameBottle(second, shape, first, firstOwn)
  if (shared === null) {
    debugAdd('ScanAction', 'the earlier read shares no brand or brewery with this one — treated as another bottle')
    return null
  }

  if (shape.kind === 'ambiguous') {
    const [{ brewery }] = shape.candidates
    const oneBrewery = shape.candidates.every((c) => c.brewery.breweryId === brewery.breweryId)
    if (oneBrewery && isHouseName(second.name_ja, brewery)) {
      const listed = shape.candidates.map((c) => c.sake)
      if (isOneSake(firstOwn)) {
        const same = listed.find((sake) => sake.brandId === firstOwn.sake.brandId)
        if (same) return found(same, 'the earlier photo found one sake of the list')
      }
      for (const name of firstNames) {
        const named = listed.filter((sake) => namesBrand(name, sake))
        if (named.length === 1) return found(named[0], 'the earlier photo names one sake of the list')
      }
    }
  }

  if (
    shared === 'brand' &&
    !isPlaceholderExtraction(first.brewery_ja) &&
    !sameBreweryAsRead(second.brewery_ja, first.brewery_ja)
  ) {
    const resolved = await resolveScannedLabel({ ...second, brewery_ja: first.brewery_ja, confidence: 1 }, executor)
    if (isOneSake(resolved) && bothFieldsAgree(resolved)) {
      return found(resolved.sake, "this photo's name under the earlier photo's brewery")
    }
  }
  return null
}
