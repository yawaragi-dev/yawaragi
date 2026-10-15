import type { DebugEvent } from '@/lib/debug/debug-log'
import type { FlavorAxis, FlavorChart } from '@/lib/schemas/flavor-chart'
import type { NonSakeDrink, ScanGrade, ScanStyle } from '@/lib/schemas/label-scan-extraction'
import type { ListCurrency } from '@/lib/schemas/list-scan-extraction'

/**
 * Wire shapes for design v1.7 §7, "Menu and shelf results". Kept apart from
 * the `'use server'` action because that file may export async functions only.
 */

/** One line of the list as it was read, for the row's "what was read" and a bottling's own row. */
export interface ListLine {
  /** List position, from 0: the menu's order, or left to right. */
  index: number
  printed: string
  /** The brand and product as printed, grade words left out: "秋鹿 奥鹿". */
  nameAsPrinted: string
  productRomaji?: string
  grade?: ScanGrade
  styles?: readonly ScanStyle[]
  price?: number
  warm?: boolean
  partlyRead?: boolean
  craft?: boolean
}

/** Why a row sits where it does, in parts the screen words (C8: from the charts alone, no model text). */
export type ListReason =
  /** Visitor has tasted it: "You gave it 3. Floral and light." */
  | { kind: 'tasted'; rating: number; axes: readonly [FlavorAxis, FlavorAxis] }
  /** "Rich and dry, like the Kidoizumi AFS you gave 4.5." */
  | { kind: 'like'; axes: readonly [FlavorAxis, FlavorAxis]; like: { name: string; rating: number } }
  /** "Dry and rich." */
  | { kind: 'axes'; axes: readonly [FlavorAxis, FlavorAxis] }
  /** "Floral and light, not much like what you rate highly." */
  | { kind: 'unusual'; axes: readonly [FlavorAxis, FlavorAxis] }
  /** The catalogue has no chart for this sake, so nothing can be said about its flavor. */
  | { kind: 'no_chart' }

/** C7: fit in words, never a percentage. */
export type ListFit = 'close' | 'some' | 'unusual'

/** One catalogue sake on the list — every line that is a bottling of it sits under it (C10). */
export interface ListRow {
  brandId: number
  sakeHref: string
  nameKanji: string
  nameRomaji: string | null
  chart: FlavorChart | null
  /** Its lines, in list order. Two or more → "3 bottlings on this list · one chart for all". */
  lines: readonly ListLine[]
  /** Null below three tastings (80), where nothing is ranked. */
  fit: ListFit | null
  reason: ListReason
  /** The visitor's latest rating of this sake, for "★ 3 · yours". */
  yourRating: number | null
}

/** A sake line the catalogue has no row for: "Couldn't match" (C5). */
export interface UnmatchedLine extends ListLine {
  /** What "Search" fills in: the brand as read. */
  query: string
}

/** A line that is not sake: greyed, collapsed, no tap (C6). */
export interface NotSakeLine {
  index: number
  printed: string
  drink: NonSakeDrink
  price?: number
}

export interface ListResult {
  kind: 'menu' | 'shelf'
  currency?: ListCurrency
  /** "For you" order when ranked; list order otherwise. */
  rows: readonly ListRow[]
  unmatched: readonly UnmatchedLine[]
  notSake: readonly NotSakeLine[]
  unreadableCount: number
  /** False below three tastings: the 80 screen, in list order with no fit. */
  ranked: boolean
  /** How many tastings the visitor has, for "{n} of 3 so far". */
  tastings: number
}

export type ListActionState = (
  | { status: 'idle' }
  | { status: 'read'; result: ListResult }
  /** Only a visitor who keeps a journal has a palate to rank for (§7: signed-in only). */
  | { status: 'not_allowed' }
  | { status: 'rate_limited'; retryAfterSec: number }
  | { status: 'session_missing' }
  | { status: 'invalid_input' }
  | { status: 'failed' }
) & { debugLog?: ReadonlyArray<DebugEvent> }

export const INITIAL_LIST_ACTION_STATE: ListActionState = { status: 'idle' }
