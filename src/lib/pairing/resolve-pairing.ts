import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { ScanStyleSchema, type ScanGrade, type ScanStyle } from '@/lib/schemas/label-scan-extraction'
import type { PairingRow } from '@/lib/schemas/pairing'
import { pairingRow, type PairingRowId } from '@/lib/pairing/pairing-table'
import { CLEARLY_DIFFERENT_Z } from '@/lib/taste/clearly-different'

/** The catalogue's mean and spread on each axis (`catalogueAxisStats`). */
export interface AxisStats {
  mean: FlavorProfile
  sd: FlavorProfile
}

export interface Pairing {
  row: PairingRow
  /**
   * What picked the row, which is what the caveat says:
   * - `style` — a style the bottling names (koshu, nigori…);
   * - `grade` — a ginjo-family grade, which usually means a fragrant sake;
   * - `chart` — the line's flavor chart against the catalogue, a claim about
   *   every bottling of the line.
   */
  basis: 'style' | 'grade' | 'chart'
  /** The grade, when it picked the row: the copy names it ("a Junmai Ginjō"). */
  grade?: ScanGrade
  /** `manual_curation` for the table read through a style or grade; `sakenowa_inferred` through the chart. */
  source: 'manual_curation' | 'sakenowa_inferred'
}

/**
 * Styles that decide the row on their own, strongest first. An aged or a
 * sparkling bottling is paired as what it is, whatever its line's chart says.
 */
const DECISIVE_STYLES: readonly [ScanStyle, PairingRowId][] = [
  ['koshu', 'koshu'],
  ['kijoshu', 'kijoshu'],
  ['sparkling', 'sparkling'],
  ['nigori', 'nigori'],
]

/**
 * Styles that change a sake too much for any row to hold, and that no
 * source pairs as a category: a taruzake is led by cedar, a genshu runs to
 * 17–19% and full body, a muroka keeps the weight filtering would take off.
 * Their presence means saying nothing — not falling through to the grade or
 * the chart, which describe the sake they modify.
 */
const BLOCKING_STYLES: ReadonlySet<ScanStyle> = new Set(['taruzake', 'genshu', 'muroka'])

/** Starters that lean rich, whatever the grade. */
const JUNSHU_STYLES: readonly ScanStyle[] = ['kimoto', 'yamahai']

/** Ginjo-family grades are usually fragrant; the other grades are too broad to name a dish. */
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
 * are usually shown under. On the whole mirror (1,462 charts, 2026-10-17)
 * this places 122 sakes as kunshu, 275 as junshu and 224 as soshu, and says
 * nothing for 841; the leading axis is spread evenly (220–282 sakes each), so
 * hojun's narrow spread does not tilt the split towards junshu.
 */
const MIN_LEAD = CLEARLY_DIFFERENT_Z
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
  // Dry with weight above the mean is a dry, rich sake, not a light one.
  if (row === 'soshu' && chart.f3 > stats.mean.f3) return null
  return row
}

/**
 * What to say a sake goes with, or `null` to say nothing.
 *
 * A decisive style first; a blocking style ends it; then kimoto / yamahai;
 * then nama (only alone — a nama genshu or muroka was blocked above); then a
 * ginjo-family grade unless the line's chart clearly says otherwise; then the
 * chart. No row is better than a generic one: a plain junmai with no clear
 * chart gets no pairing.
 */
export function resolvePairing({
  styles = [],
  grade,
  chart,
  stats,
}: {
  styles?: readonly ScanStyle[]
  grade?: ScanGrade
  chart?: FlavorProfile | null
  stats?: AxisStats | null
}): Pairing | null {
  for (const [style, id] of DECISIVE_STYLES) {
    if (styles.includes(style)) return { row: pairingRow(id), basis: 'style', source: 'manual_curation' }
  }
  if (styles.some((style) => BLOCKING_STYLES.has(style))) return null
  if (styles.some((style) => JUNSHU_STYLES.includes(style))) {
    return { row: pairingRow('junshu'), basis: 'style', source: 'manual_curation' }
  }
  if (styles.includes('nama')) return { row: pairingRow('soshu'), basis: 'style', source: 'manual_curation' }

  const fromChart = chart && stats ? rowFromChart(chart, stats) : null
  if (grade && GINJO_GRADES.has(grade)) {
    // Many ginjo are restrained and dry (Niigata's tanrei style). When the
    // line's chart clearly points elsewhere, the grade's "usually fragrant"
    // is not enough to say anything.
    if (fromChart !== null && fromChart !== 'kunshu') return null
    return { row: pairingRow('kunshu'), basis: 'grade', grade, source: 'manual_curation' }
  }
  if (fromChart) return { row: pairingRow(fromChart), basis: 'chart', source: 'sakenowa_inferred' }
  return null
}

/**
 * An own bottling's styles are words the visitor kept or typed ("Nama",
 * "Kijōshu", or one phrase like "Muroka Nama Genshu"). The ones that name a
 * known style, whatever their case or macrons; the rest are left out.
 */
export function stylesFromWords(words: readonly string[]): ScanStyle[] {
  const styles: ScanStyle[] = []
  for (const phrase of words) {
    for (const word of phrase.split(/[\s,·/+&-]+/)) {
      const key = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      const parsed = ScanStyleSchema.safeParse(key)
      if (parsed.success && !styles.includes(parsed.data)) styles.push(parsed.data)
    }
  }
  return styles
}
