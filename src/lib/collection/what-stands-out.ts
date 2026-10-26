import { type BottleFactsLookup, type Share, bottleHistoryStats } from '@/lib/collection/bottle-history-stats'
import { type EntryFacts, ratingOfEntry } from '@/lib/collection/journal-filter'
import { regionEntryFor } from '@/lib/guide/regions'
import { type JapanRegion, JAPAN_REGIONS, regionOfArea } from '@/lib/sakenowa/japan-regions'
import type { GuideSlug } from '@/lib/guide/entries'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { ScanGrade } from '@/lib/schemas/label-scan-extraction'

/**
 * "What stands out" and "Bottles you've kept" (design v1.10, AB; 129, 130):
 * plain rules over the journal, the bottle history and the catalogue — no
 * model, nothing stored, worked out on every visit so they change as the
 * journal grows. Pure: the page looks the facts up and hands them in.
 *
 * **At most one sentence of each kind** (AB2), each only when its number
 * holds up:
 *
 * - **contrast** — "You keep mostly Junmai Ginjō, but rate kimoto highest":
 *   from 8 bottles, the grade most kept (3 bottles or more, and more than any
 *   other), against the grade or starter (kimoto, yamahai) rated highest on
 *   average over 3 tastings or more, when that is a different one and rated
 *   higher than the kept grade.
 * - **share** — "Most of what you keep is Junmai Ginjō": the same kept grade,
 *   when there is no contrast and it is more than half of the bottles. Never
 *   both: a contrast already says it (AB2, "they never repeat each other").
 * - **match** — "4 of your 9 highest-rated tastings are from Tōhoku": 4
 *   tastings rated 4.5 or more, 3 of them from one of Japan's eight regions.
 * - **gap** — "Nothing from Hyōgo yet": the first prefecture Learn has a
 *   region entry for that no tasting comes from (AB4: a place, not a
 *   shortfall; it links to Learn, never to a search).
 *
 * In the prototype's order — the contrast or the share, then match, then gap.
 * **Drift** ("only once a journal spans six months", X3) is not built: the
 * design gives it neither a rule nor a sentence.
 *
 * **Limits (X5, JMStV):** nothing here counts drinking over time. Kept
 * bottles enter only as counts of kinds; shares are counts ("6 of 15
 * bottles"), never percentages (AB5).
 */

/** The section shows from this many tastings; from 5 to 7 it is a teaser line (AB2). */
export const STANDS_OUT_FROM = 8
/** Under this many tastings the basis says "your first …" and match adds "so far" (AB5). */
export const THIN_BELOW = 20
/** "Bottles you've kept" shows from this many bottles (AB3). */
export const KEPT_FROM = 5

const SHARE_FROM_BOTTLES = 8
const KEPT_GRADE_FROM = 3
const RATED_CATEGORY_FROM = 3
const HIGH_RATING = 4.5
const MATCH_HIGH_FROM = 4
const MATCH_REGION_FROM = 3

/**
 * The order the gap looks for a place in: the prototype's (Niigata, Hyōgo,
 * Kyōto, Yamagata, … Shizuoka, Nagano), then Learn's other region entries.
 */
const GAP_ORDER: readonly number[] = [15, 28, 26, 6, 22, 20, 3, 41, 24, 25]

export type RatedCategory = { kind: 'grade'; grade: ScanGrade } | { kind: 'starter'; starter: 'kimoto' | 'yamahai' }

export type Insight =
  | {
      kind: 'contrast'
      kept: { grade: ScanGrade; bottles: number; of: number }
      /** The kept grade's own average, when any tasting names it. */
      keptAverage: number | null
      rated: { category: RatedCategory; average: number; tastings: number }
    }
  | { kind: 'share'; grade: ScanGrade; bottles: number; of: number }
  | { kind: 'match'; region: JapanRegion; tastings: number; of: number }
  | { kind: 'gap'; areaId: number; slug: GuideSlug }

export interface StandsOut {
  tastings: number
  /** Bottles ever kept, each once. */
  bottles: number
  /** Under {@link THIN_BELOW} tastings: the wording says it is early. */
  thin: boolean
  /** At most three, one per kind; may be empty. */
  insights: Insight[]
}

export interface StandsOutInput {
  entries: readonly JournalEntry[]
  factsOf: (entry: JournalEntry) => EntryFacts
  events: readonly BottleEvent[]
  bottleFactsOf: BottleFactsLookup
}

const STARTERS = ['kimoto', 'yamahai'] as const

const categoryKey = (c: RatedCategory) => (c.kind === 'grade' ? `g:${c.grade}` : `s:${c.starter}`)

function categoriesOf(facts: EntryFacts): RatedCategory[] {
  const words = new Set(facts.styles.map((s) => s.trim().toLocaleLowerCase()))
  return [
    ...(facts.grade ? [{ kind: 'grade' as const, grade: facts.grade }] : []),
    ...STARTERS.filter((s) => words.has(s)).map((starter) => ({ kind: 'starter' as const, starter })),
  ]
}

const mean = (list: readonly number[]) => list.reduce((a, b) => a + b, 0) / list.length

/** The grade kept most, when it clearly is: 3 bottles or more, and more than the next. */
function keptMost(shares: readonly Share<ScanGrade>[]): Share<ScanGrade> | null {
  const [top, next] = shares
  if (!top || top.bottles < KEPT_GRADE_FROM) return null
  if (next && next.bottles >= top.bottles) return null
  return top
}

function contrastOrShare(input: StandsOutInput, bottles: number, top: Share<ScanGrade> | null): Insight | null {
  if (bottles < SHARE_FROM_BOTTLES || !top) return null

  const ratings = new Map<string, { category: RatedCategory; ratings: number[] }>()
  for (const entry of input.entries) {
    const rating = ratingOfEntry(entry)
    if (rating === null) continue
    for (const category of categoriesOf(input.factsOf(entry))) {
      const seen = ratings.get(categoryKey(category)) ?? { category, ratings: [] }
      seen.ratings.push(rating)
      ratings.set(categoryKey(category), seen)
    }
  }
  const keptKey = categoryKey({ kind: 'grade', grade: top.key })
  const kept = ratings.get(keptKey)
  const keptAverage = kept ? mean(kept.ratings) : null
  const best = [...ratings.entries()]
    .filter(([, v]) => v.ratings.length >= RATED_CATEGORY_FROM)
    .map(([key, v]) => ({ key, category: v.category, average: mean(v.ratings), tastings: v.ratings.length }))
    .sort((a, b) => b.average - a.average || b.tastings - a.tastings || (a.key < b.key ? -1 : 1))[0]

  if (best && best.key !== keptKey && (keptAverage === null || best.average > keptAverage)) {
    return {
      kind: 'contrast',
      kept: { grade: top.key, bottles: top.bottles, of: bottles },
      keptAverage,
      rated: { category: best.category, average: best.average, tastings: best.tastings },
    }
  }
  if (top.bottles * 2 > bottles) return { kind: 'share', grade: top.key, bottles: top.bottles, of: bottles }
  return null
}

function match(input: StandsOutInput): Insight | null {
  const high = input.entries.filter((e) => (ratingOfEntry(e) ?? 0) >= HIGH_RATING)
  if (high.length < MATCH_HIGH_FROM) return null
  const counts = new Map<JapanRegion, number>()
  for (const entry of high) {
    const areaId = input.factsOf(entry).areaId
    const region = areaId === null ? null : regionOfArea(areaId)
    if (region) counts.set(region, (counts.get(region) ?? 0) + 1)
  }
  const [region, tastings] =
    [...counts.entries()].sort((a, b) => b[1] - a[1] || JAPAN_REGIONS.indexOf(a[0]) - JAPAN_REGIONS.indexOf(b[0]))[0] ??
    []
  if (!region || !tastings || tastings < MATCH_REGION_FROM) return null
  return { kind: 'match', region, tastings, of: high.length }
}

function gap(input: StandsOutInput): Insight | null {
  const tasted = new Set(input.entries.flatMap((e) => input.factsOf(e).areaId ?? []))
  // With no prefecture known at all, the catalogue could not be read: "nothing
  // from Niigata" would be a guess.
  if (tasted.size === 0) return null
  for (const areaId of GAP_ORDER) {
    const slug = regionEntryFor(areaId)
    if (slug && !tasted.has(areaId)) return { kind: 'gap', areaId, slug }
  }
  return null
}

export function whatStandsOut(input: StandsOutInput): StandsOut | null {
  const tastings = input.entries.length
  if (tastings < STANDS_OUT_FROM) return null
  const stats = bottleHistoryStats(input.events, input.bottleFactsOf)
  const insights = [
    contrastOrShare(input, stats.bottlesAdded, keptMost(stats.byGrade.shares)),
    match(input),
    gap(input),
  ].filter((i): i is Insight => i !== null)
  return { tastings, bottles: stats.bottlesAdded, thin: tastings < THIN_BELOW, insights: insights.slice(0, 3) }
}

export interface BottlesKept {
  bottles: number
  /** Up to four each, most first (AB3). */
  grades: Share<ScanGrade>[]
  prefectures: Share<number>[]
}

/** "Bottles you've kept" (AB3): from 5 bottles, the grades and prefectures, top four each. */
export function bottlesKept(events: readonly BottleEvent[], bottleFactsOf: BottleFactsLookup): BottlesKept | null {
  const stats = bottleHistoryStats(events, bottleFactsOf)
  if (stats.bottlesAdded < KEPT_FROM) return null
  return {
    bottles: stats.bottlesAdded,
    grades: stats.byGrade.shares.slice(0, 4),
    prefectures: stats.byPrefecture.shares.slice(0, 4),
  }
}
