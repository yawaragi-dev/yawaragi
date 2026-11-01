/**
 * PROTOTYPE fixture — a made-up cellar, read the way the real feature would
 * read one. No Upstash, no database: the rows, their styles, grades and
 * charts, and the catalogue's mean and spread are all invented here.
 *
 * Each case is chosen to land somewhere different in `resolvePairing`:
 * a style (kimoto, nama, koshu, kijoshu, sparkling), a ginjo grade, a chart,
 * a blocking style (genshu / muroka) and a plain junmai with an average chart.
 * There is no nigori, so "Spicy" shows the "nothing in your cellar" state.
 */
import { cellarFreshness, sortCellar } from '@/lib/collection/cellar'
import { type PairingRowId, pairingRow } from '@/lib/pairing/pairing-table'
import { type AxisStats, resolvePairing } from '@/lib/pairing/resolve-pairing'
import { gradeLabel } from '@/lib/scan/read-bottling'
import { type CellarBottle, cellarRowKey } from '@/lib/schemas/cellar-bottle'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { ScanGrade, ScanStyle } from '@/lib/schemas/label-scan-extraction'
import type { ProtoBottle } from './pick-for-dish'

/** A fixed "now", so the prototype renders the same on every load. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 1, 12)
const DAY = 24 * 60 * 60 * 1000

/** Invented, roughly the shape of the real catalogue stats. */
const STATS: AxisStats = {
  mean: { f1: 0.35, f2: 0.55, f3: 0.4, f4: 0.45, f5: 0.4, f6: 0.45 },
  sd: { f1: 0.15, f2: 0.15, f3: 0.15, f4: 0.15, f5: 0.15, f6: 0.15 },
}
const AVERAGE: FlavorProfile = { ...STATS.mean }

interface FixtureRow {
  id: number
  nameRomaji: string
  nameKanji: string
  bottling?: string
  sizeMl: 180 | 300 | 720 | 1800 | null
  count: number
  nama?: boolean
  openedDaysAgo?: number
  addedDaysAgo: number
  styles?: ScanStyle[]
  grade?: ScanGrade
  chart?: FlavorProfile
}

const ROWS: FixtureRow[] = [
  { id: 1, nameRomaji: 'Dassai 45', nameKanji: '獺祭', sizeMl: 720, count: 1, openedDaysAgo: 3, addedDaysAgo: 20, grade: 'junmai_daiginjo', chart: { ...AVERAGE, f1: 0.62 } },
  { id: 2, nameRomaji: 'Jikon', nameKanji: '而今', sizeMl: 720, count: 1, addedDaysAgo: 4, chart: { ...AVERAGE, f1: 0.7, f6: 0.5 } },
  { id: 3, nameRomaji: 'Daishichi Kimoto Classic', nameKanji: '大七', bottling: 'Daishichi Kimoto Classic', sizeMl: 720, count: 1, openedDaysAgo: 12, addedDaysAgo: 40, styles: ['kimoto'] },
  { id: 4, nameRomaji: 'Suigei', nameKanji: '酔鯨', sizeMl: 1800, count: 1, openedDaysAgo: 2, addedDaysAgo: 15, chart: { ...AVERAGE, f5: 0.75, f3: 0.3 } },
  { id: 5, nameRomaji: 'Kaze no Mori Nama', nameKanji: '風の森', bottling: 'Kaze no Mori Nama', sizeMl: 720, count: 1, nama: true, openedDaysAgo: 6, addedDaysAgo: 9, styles: ['nama'] },
  { id: 6, nameRomaji: 'Kokuryu Muroka Nama Genshu', nameKanji: '黒龍', bottling: 'Kokuryu Muroka Nama Genshu', sizeMl: 720, count: 1, nama: true, addedDaysAgo: 2, styles: ['muroka', 'nama', 'genshu'] },
  { id: 7, nameRomaji: 'Hanahato Kijoshu', nameKanji: '華鳩', bottling: 'Hanahato Kijoshu', sizeMl: 300, count: 1, addedDaysAgo: 60, styles: ['kijoshu'] },
  { id: 8, nameRomaji: 'Mio', nameKanji: '澪', bottling: 'Mio Sparkling', sizeMl: 300, count: 2, addedDaysAgo: 7, styles: ['sparkling'] },
  { id: 9, nameRomaji: 'Daruma Masamune 3 Years', nameKanji: '達磨正宗', bottling: 'Daruma Masamune 3 Years', sizeMl: 720, count: 1, addedDaysAgo: 90, styles: ['koshu'] },
  { id: 10, nameRomaji: 'Tedorigawa', nameKanji: '手取川', sizeMl: 720, count: 1, openedDaysAgo: 6, addedDaysAgo: 30, grade: 'junmai', chart: AVERAGE },
]

const BLOCKING: readonly ScanStyle[] = ['taruzake', 'genshu', 'muroka']

function toCellarBottle(row: FixtureRow): CellarBottle {
  return {
    schemaVersion: 3,
    brandId: row.id,
    ...(row.bottling ? { expression: { id: `proto-${row.id}`, name: row.bottling } } : {}),
    sake: { nameKanji: row.nameKanji, nameRomaji: row.nameRomaji },
    sizeMl: row.sizeMl,
    nama: row.nama ?? false,
    count: row.count,
    openedAt: row.openedDaysAgo === undefined ? null : FIXTURE_NOW - row.openedDaysAgo * DAY,
    addedAt: FIXTURE_NOW - row.addedDaysAgo * DAY,
    updatedAt: FIXTURE_NOW - row.addedDaysAgo * DAY,
  }
}

/** The fixture cellar, read: each row's freshness, cellar order and table row. */
export function fixtureCellar(which: 'full' | 'empty'): ProtoBottle[] {
  if (which === 'empty') return []
  const pairs = ROWS.map((row) => ({ row, bottle: toCellarBottle(row) }))
  const order = sortCellar(
    pairs.map((p) => p.bottle),
    FIXTURE_NOW,
  ).map(cellarRowKey)
  return pairs.map(({ row, bottle }) => {
    const pairing = resolvePairing({ styles: row.styles, grade: row.grade, chart: row.chart, stats: STATS })
    const key = cellarRowKey(bottle)
    const name = bottle.expression?.name ?? row.nameRomaji
    return {
      key,
      name,
      kanji: row.nameKanji,
      sizeMl: bottle.sizeMl,
      count: bottle.count,
      nama: bottle.nama,
      freshness: cellarFreshness(bottle, FIXTURE_NOW),
      cellarOrder: order.indexOf(key),
      pairing: pairing
        ? {
            rowId: pairing.row.id as PairingRowId,
            basis: pairing.basis,
            source: pairing.source,
            ...(pairing.grade ? { grade: gradeLabel(pairing.grade) } : {}),
            foods: pairingRow(pairing.row.id as PairingRowId).foods,
          }
        : null,
      ...(pairing
        ? {}
        : { unplacedReason: (row.styles ?? []).some((s) => BLOCKING.includes(s)) ? ('styleUnpaired' as const) : ('tooLittle' as const) }),
    }
  })
}
