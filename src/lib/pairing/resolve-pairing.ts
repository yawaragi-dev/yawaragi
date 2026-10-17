import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { ScanStyleSchema, type ScanGrade, type ScanStyle } from '@/lib/schemas/label-scan-extraction'
import type { PairingRow } from '@/lib/schemas/pairing'
import { pairingRow, type PairingRowId } from '@/lib/pairing/pairing-table'

/** The catalogue's mean and spread on each axis (`catalogueAxisStats`). */
export interface AxisStats {
  mean: FlavorProfile
  sd: FlavorProfile
}

export interface Pairing {
  row: PairingRow
  /**
   * `manual_curation` when the bottling's own grade or style picked the row;
   * `sakenowa_inferred` when the sake's flavor chart did — a claim about the
   * whole line, shown with that caveat.
   */
  source: 'manual_curation' | 'sakenowa_inferred'
}

/**
 * Styles that decide the row on their own, strongest first. An aged or a
 * sparkling bottling is paired as what it is, whatever its line's chart says.
 */
const STYLE_ROWS: readonly [ScanStyle, PairingRowId][] = [
  ['koshu', 'koshu'],
  ['kijoshu', 'kijoshu'],
  ['sparkling', 'sparkling'],
  ['nigori', 'nigori'],
  ['kimoto', 'junshu'],
  ['yamahai', 'junshu'],
  ['nama', 'soshu'],
]

/** Ginjo-family grades pair as fragrant sake; the other grades are too broad to name a dish. */
const GINJO_GRADES: ReadonlySet<ScanGrade> = new Set(['junmai_daiginjo', 'daiginjo', 'junmai_ginjo', 'ginjo'])

/** Which SSI type each axis points to. Mild (f4) points to none. */
const AXIS_ROW: Record<keyof FlavorProfile, PairingRowId | null> = {
  f1: 'kunshu',
  f2: 'junshu',
  f3: 'junshu',
  f4: null,
  f5: 'soshu',
  f6: 'soshu',
}

/**
 * How far the leading axis must stand from the catalogue mean, in standard
 * deviations, and how far ahead of the best axis pointing elsewhere.
 *
 * Raw values cannot be used: Sakenowa scales each sake's chart on its own,
 * and hojun is high on nearly every sake, so "the largest value" calls Dassai
 * and Juyondai rich. Against the catalogue, they lead on hanayaka, Daishichi
 * and Kenbishi on hojun and juko, Suigei on dry — the SSI types their makers
 * are usually shown under (checked on 26 sakes, 2026-10-17).
 */
const MIN_LEAD = 1
const MIN_GAP = 0.3

function rowFromChart(chart: FlavorProfile, stats: AxisStats): PairingRowId | null {
  const axes = Object.keys(AXIS_ROW) as (keyof FlavorProfile)[]
  const z = axes.map((axis) => ({ axis, z: (chart[axis] - stats.mean[axis]) / stats.sd[axis] }))
  z.sort((a, b) => b.z - a.z)
  const lead = z[0]
  const row = AXIS_ROW[lead.axis]
  if (row === null || lead.z < MIN_LEAD) return null
  const rival = z.find((entry) => AXIS_ROW[entry.axis] !== row)
  if (rival && lead.z - rival.z < MIN_GAP) return null
  return row
}

/**
 * What to say a sake goes with, or `null` to say nothing.
 *
 * The bottling's style first, then a ginjo-family grade, then the sake's
 * chart against the catalogue. No row is better than a generic one: a plain
 * junmai with no clear chart gets no pairing, not "grilled or savory dishes".
 */
export function resolvePairing({
  styles,
  grade,
  chart,
  stats,
}: {
  styles?: readonly ScanStyle[]
  grade?: ScanGrade
  chart?: FlavorProfile | null
  stats?: AxisStats | null
}): Pairing | null {
  for (const [style, id] of STYLE_ROWS) {
    if (styles?.includes(style)) return { row: pairingRow(id), source: 'manual_curation' }
  }
  if (grade && GINJO_GRADES.has(grade)) return { row: pairingRow('kunshu'), source: 'manual_curation' }
  if (chart && stats) {
    const id = rowFromChart(chart, stats)
    if (id) return { row: pairingRow(id), source: 'sakenowa_inferred' }
  }
  return null
}

/**
 * An own bottling's styles are words the visitor kept or typed ("Nama",
 * "Kijōshu", prefilled from the label as `styleLabel` writes them). The ones
 * that name a known style, whatever their case or macrons; the rest are left
 * out of pairing.
 */
export function stylesFromWords(words: readonly string[]): ScanStyle[] {
  const styles: ScanStyle[] = []
  for (const word of words) {
    const key = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    const parsed = ScanStyleSchema.safeParse(key)
    if (parsed.success) styles.push(parsed.data)
  }
  return styles
}
