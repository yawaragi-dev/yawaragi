import { romajiKey } from '@/lib/sakenowa/romaji-key'
import { type BottlingDetails, MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'
import type { ScanBottling, ScanGrade, ScanStyle } from '@/lib/schemas/label-scan-extraction'

/**
 * What a scan's read says about the bottling, put to use.
 *
 * The catalogue stops at the sake (the line): it knows 水尾, not 水尾 一味
 * 純米. The label says the rest, and the read carries it (`bottling`). Two
 * uses, both for a visitor who keeps a journal:
 *
 * - a name to start from when they add the bottling, so it is one tap
 *   rather than typing a grade on a phone;
 * - recognising the bottling among the ones they already added to this
 *   line, so the next tasting lands on its page.
 *
 * Grades and styles are written the way the app writes them elsewhere
 * (Junmai Ginjō, Nama). They are names of things, the same in every locale,
 * so they are not translated strings.
 */

const GRADE_LABEL: Record<ScanGrade, string> = {
  junmai_daiginjo: 'Junmai Daiginjō',
  daiginjo: 'Daiginjō',
  junmai_ginjo: 'Junmai Ginjō',
  ginjo: 'Ginjō',
  tokubetsu_junmai: 'Tokubetsu Junmai',
  junmai: 'Junmai',
  tokubetsu_honjozo: 'Tokubetsu Honjōzō',
  honjozo: 'Honjōzō',
  futsushu: 'Futsūshu',
}

const STYLE_LABEL: Record<ScanStyle, string> = {
  nama: 'Nama',
  namachozo: 'Namachozō',
  namazume: 'Namazume',
  genshu: 'Genshu',
  muroka: 'Muroka',
  nigori: 'Nigori',
  sparkling: 'Sparkling',
  koshu: 'Koshu',
  kimoto: 'Kimoto',
  yamahai: 'Yamahai',
  taruzake: 'Taruzake',
  kijoshu: 'Kijōshu',
  hiyaoroshi: 'Hiyaoroshi',
}

/** A name longer than this reads as a sentence; the visitor can add more. */
const MAX_STYLES_IN_NAME = 2

export function gradeLabel(grade: ScanGrade): string {
  return GRADE_LABEL[grade]
}

/** Whether the read says anything the line's name does not. */
export function readNamesABottling(bottling: ScanBottling | undefined): bottling is ScanBottling {
  if (!bottling) return false
  return Boolean(bottling.product_name?.trim()) || bottling.grade !== undefined || (bottling.styles?.length ?? 0) > 0
}

/**
 * The name to offer for a new bottling: the line, the product name in Latin
 * letters with the printed words in brackets, the grade, up to two style
 * words — "Mizuo Ichiaji (一味) Junmai" (design v1.7 D2, v1.7.1 H2). The
 * reading leads because the visitor may not read kanji; a product name in
 * Latin letters already stands alone. `null`
 * when the label adds nothing to the line's name, and the form then starts
 * from the line's name as it always did.
 */
export function bottlingNameFromRead(lineName: string, bottling: ScanBottling | undefined): string | null {
  if (!readNamesABottling(bottling)) return null
  const line = lineName.trim()
  const product = bottling.product_name?.trim()
  const parts = [line]
  // A product name that only repeats the line (花巴 beside Hanatomoe is not
  // told apart here, but a literal repeat is) adds nothing.
  if (product && !sameText(product, line)) {
    const reading = bottling.product_name_romaji?.trim()
    parts.push(reading && !sameText(reading, product) && !sameText(reading, line) ? `${reading} (${product})` : product)
  }
  if (bottling.grade) parts.push(GRADE_LABEL[bottling.grade])
  for (const style of (bottling.styles ?? []).slice(0, MAX_STYLES_IN_NAME)) parts.push(STYLE_LABEL[style])
  return parts.join(' ').slice(0, MAX_EXPRESSION_TEXT).trim()
}

/**
 * §5's "On this label" (design v1.7 D4, 83): what the read found beyond the
 * line's name — the product as printed, the grade, up to two styles. The
 * polishing ratio is a sentence ("50% polished") and the caller words it.
 * Empty when the label says nothing more.
 */
export function onThisLabelParts(bottling: ScanBottling | undefined): string[] {
  if (!bottling) return []
  const parts: string[] = []
  const product = bottling.product_name?.trim()
  if (product) parts.push(product)
  if (bottling.grade) parts.push(GRADE_LABEL[bottling.grade])
  for (const style of (bottling.styles ?? []).slice(0, MAX_STYLES_IN_NAME)) parts.push(STYLE_LABEL[style])
  return parts
}

/**
 * The naming form's Grade, Polishing and Style as the label gives them
 * (design v1.7 D5, 84): the visitor checks them before saving.
 */
export function detailsFromRead(bottling: ScanBottling | undefined): BottlingDetails | undefined {
  if (!bottling) return undefined
  const details: BottlingDetails = {
    ...(bottling.grade ? { grade: bottling.grade } : {}),
    ...(bottling.styles?.length ? { styles: bottling.styles.map((s) => STYLE_LABEL[s]) } : {}),
    ...(bottling.polishing_ratio ? { polishingPct: Math.round(bottling.polishing_ratio) } : {}),
  }
  return Object.keys(details).length > 0 ? details : undefined
}

/**
 * Which of the visitor's bottlings of this line the label is, if exactly one
 * fits. It fits when its grade — the stored field, or failing that a grade
 * its name spells — is the label's, and when its name carries the product
 * name the label prints or its styles share the label's; never with another
 * grade. Two that fit equally are no answer — the visitor picks.
 */
export function ownBottlingForRead<
  T extends { id: string; name: string; grade?: ScanGrade; styles?: readonly string[] },
>(
  bottling: ScanBottling | undefined,
  own: readonly T[],
): T | null {
  if (!readNamesABottling(bottling)) return null
  const product = bottling.product_name?.trim()
  const scored = own
    .map((candidate) => ({ candidate, score: fit(candidate, product, bottling) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  if (scored.length === 0) return null
  if (scored.length > 1 && scored[0].score === scored[1].score) return null
  return scored[0].candidate
}

function fit(
  candidate: { name: string; grade?: ScanGrade; styles?: readonly string[] },
  product: string | undefined,
  read: ScanBottling,
): number {
  const grade = read.grade
  // The stored grade (design v1.7 D5) is the visitor's word on it; a grade
  // spelled in the name is the fallback for bottlings saved before it.
  const ownGrade = candidate.grade ?? gradeIn(candidate.name)
  // The visitor gave a grade and the label prints another: not this one,
  // whatever else agrees.
  if (grade && ownGrade && ownGrade !== grade) return 0
  let score = 0
  if (product && contains(candidate.name, product)) score += 2
  if (grade && ownGrade === grade) score += 1
  const ownStyles = new Set((candidate.styles ?? []).map((s) => romajiKey(s)))
  for (const style of read.styles ?? []) if (ownStyles.has(romajiKey(STYLE_LABEL[style]))) score += 1
  return score
}

/** The grade a typed name carries: the longest one it spells, so "Junmai Ginjo" is not "Junmai". */
function gradeIn(name: string): ScanGrade | null {
  const key = romajiKey(name)
  let found: ScanGrade | null = null
  let length = 0
  for (const grade of Object.keys(GRADE_LABEL) as ScanGrade[]) {
    const gradeKey = romajiKey(GRADE_LABEL[grade])
    if (gradeKey.length > length && key.includes(gradeKey)) {
      found = grade
      length = gradeKey.length
    }
  }
  return found
}

function contains(name: string, part: string): boolean {
  if (name.includes(part)) return true
  const partKey = romajiKey(part)
  return partKey.length >= 3 && romajiKey(name).includes(partKey)
}

function sameText(a: string, b: string): boolean {
  if (a === b) return true
  const keyA = romajiKey(a)
  return keyA.length > 0 && keyA === romajiKey(b)
}
