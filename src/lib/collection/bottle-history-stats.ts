import type { EntryFacts } from '@/lib/collection/journal-filter'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { ScanGrade } from '@/lib/schemas/label-scan-extraction'

/**
 * "What you bought" (design question AB): shares of the bottles a User has
 * ever added to the cellar — by grade, style, prefecture, size and nama —
 * computed from the bottle history. Pure: the caller looks the facts up (as
 * the journal does with `lookupJournalFacts`) and hands them in.
 *
 * Only `added` events count: a bottle is "bought" once, whatever happened to
 * it afterwards. Seeded events count too — they are the bottles that were in
 * the cellar when the history began.
 *
 * Deliberately no time axis (design X5, JMStV): no per-month counts, no
 * litres, no rate of buying or finishing. A share of what was bought is about
 * taste; how much and how fast is not, and stays out.
 */

/** What a bottle's thing is, looked up: the subset of {@link EntryFacts} a share needs. */
export type BottleFacts = Pick<EntryFacts, 'areaId' | 'grade' | 'styles'>

/** Facts for an event's thing — a sake or a bottling — or `null` when unknown. */
export type BottleFactsLookup = (thing: BottleEvent['thing']) => BottleFacts | null

export interface Share<K> {
  key: K
  bottles: number
  /** `bottles / bottlesAdded`, 0..1. */
  share: number
}

export interface Shares<K> {
  /** Largest first; ties in key order. */
  shares: Share<K>[]
  /** Bottles with nothing known on this axis (no grade, no prefecture…). */
  unknown: number
}

export interface BottleHistoryStats {
  /** Bottles ever added, seeded ones included. The denominator of every share. */
  bottlesAdded: number
  byGrade: Shares<ScanGrade>
  /**
   * A bottling can carry several style words, so these shares can sum past 1:
   * each says "this share of your bottles was kimoto". Words are compared
   * without case, and reported lower-cased.
   */
  byStyle: Shares<string>
  /** Sakenowa areaId of the brewery's prefecture. */
  byPrefecture: Shares<number>
  bySize: Shares<number>
  /** Bottles the User marked nama, and their share. */
  nama: { bottles: number; share: number }
}

const NO_FACTS: BottleFacts = { areaId: null, grade: null, styles: [] }

function tally<K extends string | number>(counts: Map<K, number>, unknown: number, total: number): Shares<K> {
  const shares = [...counts.entries()]
    .map(([key, bottles]) => ({ key, bottles, share: total === 0 ? 0 : bottles / total }))
    .sort((a, b) => b.bottles - a.bottles || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  return { shares, unknown }
}

function add<K>(counts: Map<K, number>, key: K, n: number) {
  counts.set(key, (counts.get(key) ?? 0) + n)
}

export function bottleHistoryStats(
  events: readonly BottleEvent[],
  factsOf: BottleFactsLookup = () => null,
): BottleHistoryStats {
  const grades = new Map<ScanGrade, number>()
  const styles = new Map<string, number>()
  const prefectures = new Map<number, number>()
  const sizes = new Map<number, number>()
  let total = 0
  let noGrade = 0
  let noStyle = 0
  let noPrefecture = 0
  let noSize = 0
  let nama = 0

  for (const event of events) {
    if (event.kind !== 'added') continue
    const n = event.count
    total += n
    const facts = factsOf(event.thing) ?? NO_FACTS

    if (facts.grade) add(grades, facts.grade, n)
    else noGrade += n

    const words = [...new Set(facts.styles.map((s) => s.trim().toLocaleLowerCase()).filter(Boolean))]
    if (words.length === 0) noStyle += n
    for (const word of words) add(styles, word, n)

    if (facts.areaId !== null) add(prefectures, facts.areaId, n)
    else noPrefecture += n

    if (event.sizeMl !== null) add(sizes, event.sizeMl, n)
    else noSize += n

    if (event.nama) nama += n
  }

  return {
    bottlesAdded: total,
    byGrade: tally(grades, noGrade, total),
    byStyle: tally(styles, noStyle, total),
    byPrefecture: tally(prefectures, noPrefecture, total),
    bySize: tally(sizes, noSize, total),
    nama: { bottles: nama, share: total === 0 ? 0 : nama / total },
  }
}
