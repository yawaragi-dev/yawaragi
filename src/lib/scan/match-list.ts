import { expandBrandVariants } from '@/lib/sakenowa/brewery-variants'
import { romajiKey } from '@/lib/sakenowa/romaji-key'
import { isOnlyLabelWords } from '@/lib/sakenowa/search-brands'
import type { ResolveScannedLabelResult, ScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import type { Brand } from '@/lib/schemas/brand'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { nonSakeDrinkOf } from '@/lib/schemas/label-scan-extraction'
import type { ListScanExtraction, ListScanLine } from '@/lib/schemas/list-scan-extraction'
import type { ListLine, NotSakeLine, UnmatchedLine } from './list-action-state'
import type { UnrankedRow } from './rank-list'

/**
 * Turns a list read into §7's three groups: the catalogue sakes on it (one
 * row per sake, its bottlings under it — C10), the sake lines the catalogue
 * has no row for ("Couldn't match", C5), and the lines that are not sake
 * (C6). Each sake line is looked up exactly as a label read is, through
 * `resolveScannedLabel`, so a menu line and a bottle land on the same row.
 *
 * Injected lookups keep this free of the database for the tests; the action
 * binds them to the catalogue.
 */
export interface MatchListDeps {
  resolve: (label: ScannedLabel) => Promise<ResolveScannedLabelResult>
  chartFor: (brandId: number) => Promise<FlavorChart | null>
  sakeHref: (brandId: number) => string
}

export interface MatchedList {
  rows: UnrankedRow[]
  unmatched: UnmatchedLine[]
  notSake: NotSakeLine[]
}

/**
 * A line's read is not a label's: one list carries one confidence for every
 * line. The lookup's confidence gate is for a label the model was unsure of;
 * here the model returns only lines whose name it read (the rest are counted
 * unreadable), so each line is looked up at the list's confidence, never
 * below the gate's "confirm" tier.
 */
const LINE_CONFIDENCE_FLOOR = 0.6

export async function matchList(extraction: ListScanExtraction, deps: MatchListDeps): Promise<MatchedList> {
  const notSake: NotSakeLine[] = []
  const sakeLines: { line: ListLine; read: ListScanLine }[] = []
  extraction.lines.forEach((read, index) => {
    const drink = nonSakeDrinkOf(read)
    if (drink) {
      notSake.push({ index, printed: read.printed, drink, ...(read.price !== undefined ? { price: read.price } : {}) })
    } else {
      sakeLines.push({ line: listLineOf(read, index), read })
    }
  })

  const confidence = Math.max(extraction.confidence ?? 0.9, LINE_CONFIDENCE_FLOOR)
  // A lookup that fails costs its line a row, not the list: the line is
  // still shown, under "Couldn't match", with its search.
  const brands = await Promise.all(
    sakeLines.map(({ read }) => brandForLine(read, confidence, deps.resolve).catch(() => null)),
  )

  const byBrand = new Map<number, { sake: Brand; lines: ListLine[] }>()
  const unmatched: UnmatchedLine[] = []
  sakeLines.forEach(({ line, read }, i) => {
    const sake = brands[i]
    if (!sake) {
      unmatched.push({ ...line, query: read.name_ja })
      return
    }
    const group = byBrand.get(sake.brandId) ?? { sake, lines: [] }
    group.lines.push(line)
    byBrand.set(sake.brandId, group)
  })

  const groups = [...byBrand.values()]
  const charts = await Promise.all(groups.map(({ sake }) => deps.chartFor(sake.brandId).catch(() => null)))
  const rows = groups.map(
    ({ sake, lines }, i): UnrankedRow => ({
      brandId: sake.brandId,
      sakeHref: deps.sakeHref(sake.brandId),
      nameKanji: sake.nameKanji,
      nameRomaji: sake.nameRomaji ?? (sake.name || null),
      chart: charts[i],
      lines,
    }),
  )
  return { rows, unmatched, notSake }
}

export function listLineOf(read: ListScanLine, index: number): ListLine {
  const nameAsPrinted = [read.name_ja, read.product_name].filter((p) => p && p.trim() !== '').join(' ')
  return {
    index,
    printed: read.printed,
    nameAsPrinted,
    ...(read.product_name_romaji ? { productRomaji: read.product_name_romaji } : {}),
    ...(read.grade ? { grade: read.grade } : {}),
    ...(read.styles?.length ? { styles: read.styles } : {}),
    ...(read.price !== undefined ? { price: read.price } : {}),
    ...(read.warm ? { warm: true } : {}),
    ...(read.partly_read ? { partlyRead: true } : {}),
    ...(read.craft ? { craft: true } : {}),
  }
}

/**
 * The one catalogue sake a line names, or `null`.
 *
 * - An exact match, or the brand alone (a menu rarely prints the brewery, and
 *   the brewery the model supplies from its own knowledge is no witness).
 * - The brewery alone only where the line's Latin reading is the sake's
 *   name: the catalogue stores some names in Latin letters (赤武 as AKABU),
 *   so the kanji misses and the brewery finds it. Otherwise never: the
 *   line's name is what a menu prints, and a name that is not the sake's is
 *   not the sake.
 * - A list only when exactly one of its sakes carries the name as read (李白
 *   among 李白's sub-lines); otherwise the visitor searches, where every
 *   candidate is shown.
 */
async function brandForLine(
  read: ListScanLine,
  confidence: number,
  resolve: MatchListDeps['resolve'],
): Promise<Brand | null> {
  // A grade or style word read as the name ("ひやおろし", "大吟醸") names no
  // sake; the catalogue has a brand or two called that, and it is not this.
  if (isOnlyLabelWords(read.name_ja)) return null
  const resolved = await resolve({
    name_ja: read.name_ja,
    // With no brewery, the brand stands in: its brewery variants (李白 →
    // 李白酒造) find a house named after its sake, and the brand-only pass
    // finds the rest.
    brewery_ja: read.brewery_ja?.trim() || read.name_ja,
    confidence,
    other_names: [...(read.other_names ?? []), ...(read.product_name ? [read.product_name] : [])],
  })
  switch (resolved.kind) {
    case 'exact':
    case 'matched_brand_only':
      return resolved.sake
    case 'matched_brewery_only':
      return readsAs(read.name_romaji, resolved.sake) ? resolved.sake : null
    case 'ambiguous': {
      const variants = expandBrandVariants(read.name_ja)
      const named = resolved.candidates.filter((c) => variants.includes(c.sake.nameKanji))
      return named.length === 1 ? named[0].sake : null
    }
    default:
      return null
  }
}

/** Is the line's Latin reading the sake's own name, letter for letter? */
function readsAs(romaji: string | undefined, sake: Brand): boolean {
  if (!romaji?.trim()) return false
  const key = romajiKey(romaji)
  return key.length >= 3 && [sake.nameKanji, sake.name, sake.nameRomaji].some((n) => n != null && romajiKey(n) === key)
}
