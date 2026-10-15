import { flavorDistance, type FlavorAxes } from '@/lib/flavor/flavor-similarity'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import { palateStage } from '@/lib/taste/palate-read'
import type { ListFit, ListReason, ListRow } from './list-action-state'

/**
 * Design v1.7 §7's ranking: each sake on a menu or shelf placed by how close
 * its flavor chart sits to the sakes the visitor rates highly, with the reason
 * and the fit in words. Built from the charts and the visitor's ratings alone
 * — no model call, no model text (C8) — so it is deterministic and testable as
 * arithmetic.
 *
 * Similarity is the prototype's `l2Sim`: `1 − d / √6`, the L2 distance over
 * the six axes measured against the cube's diagonal. That is not §6's
 * "% alike" curve (`similarity-reason.ts`), which is tuned for near
 * neighbours; §7 compares a palate with whatever is on a menu, and its
 * thresholds (0.82, 0.75, 0.8) are stated on this scale.
 */

/** C7: "Close to what you rate highly" at or above this. */
export const CLOSE_FIT = 0.82
/** C7: "Some of what you like" at or above this; "Not your usual" below. */
export const SOME_FIT = 0.75
/** C8: a rated sake is named in the reason only if it is at least this alike. */
export const NAMED_LIKE = 0.8
/** C8: "the sakes you rate highly" — a rating of 4 or more. */
export const RATED_HIGHLY = 4

const DIAGONAL = Math.sqrt(FLAVOR_AXES.length)

export function listSimilarity(a: FlavorAxes, b: FlavorAxes): number {
  return 1 - flavorDistance(a, b) / DIAGONAL
}

export function fitOf(similarity: number): ListFit {
  return similarity >= CLOSE_FIT ? 'close' : similarity >= SOME_FIT ? 'some' : 'unusual'
}

/** The chart's two strongest axes, ties in f1..f6 order: "Rich and dry". */
export function strongestAxes(chart: FlavorAxes): readonly [FlavorAxis, FlavorAxis] {
  const [first, second] = [...FLAVOR_AXES].sort(
    (a, b) => chart[b] - chart[a] || FLAVOR_AXES.indexOf(a) - FLAVOR_AXES.indexOf(b),
  )
  return [first, second]
}

/** A row before it is ranked: everything but fit, reason and the visitor's rating. */
export type UnrankedRow = Omit<ListRow, 'fit' | 'reason' | 'yourRating'>

export interface RankedList {
  rows: ListRow[]
  ranked: boolean
  tastings: number
}

/**
 * Rank a list's rows for the visitor whose journal `entries` is. Below three
 * rated tastings nothing is ranked (C4, screenshot 80): rows stay in list
 * order with the axis words alone. Rows without a chart cannot be placed; they
 * follow the ranked ones in list order.
 */
export function rankList(rows: readonly UnrankedRow[], entries: readonly JournalEntry[], now: number): RankedList {
  const ratings = entries.filter(
    (e): e is JournalEntry & { event: { kind: 'rating' } } => e.event.kind === 'rating',
  )
  const tastings = ratings.length
  const ranked = palateStage(tastings) === 'read'
  const palate = deriveTasteProfile(
    ratings.map((e) => e.event),
    now,
  )
  const liked = ratings.filter((e) => e.event.rating >= RATED_HIGHLY && e.event.target !== null)

  const latestRating = (brandId: number): number | null => {
    const mine = ratings.filter((e) => e.event.brandId === brandId).sort((a, b) => b.triedAt - a.triedAt)
    return mine[0]?.event.rating ?? null
  }

  const placed = rows.map((row) => {
    const yourRating = latestRating(row.brandId)
    if (!row.chart) {
      return { row: { ...row, fit: null, reason: { kind: 'no_chart' } as const, yourRating }, similarity: null }
    }
    const axes = strongestAxes(row.chart)
    if (!ranked) {
      return { row: { ...row, fit: null, reason: { kind: 'axes', axes } as const, yourRating }, similarity: null }
    }
    const similarity = listSimilarity(palate, row.chart)
    const fit = fitOf(similarity)
    return { row: { ...row, fit, reason: reasonFor(row, axes, fit, yourRating, liked), yourRating }, similarity }
  })

  if (!ranked) return { rows: placed.map((p) => p.row), ranked, tastings }
  // Nearest first; equal similarity, and every row without a chart, in list order.
  const order = (p: (typeof placed)[number]) => p.row.lines[0]?.index ?? 0
  const sorted = [...placed].sort((a, b) => {
    if (a.similarity === null || b.similarity === null) {
      if (a.similarity !== b.similarity) return a.similarity === null ? 1 : -1
      return order(a) - order(b)
    }
    return b.similarity - a.similarity || order(a) - order(b)
  })
  return { rows: sorted.map((p) => p.row), ranked, tastings }
}

function reasonFor(
  row: UnrankedRow,
  axes: readonly [FlavorAxis, FlavorAxis],
  fit: ListFit,
  yourRating: number | null,
  liked: readonly (JournalEntry & { event: { kind: 'rating' } })[],
): ListReason {
  if (yourRating !== null) return { kind: 'tasted', rating: yourRating, axes }
  const chart = row.chart!
  const nearest = liked
    // The sake itself is "tasted" above; a bottling of it is the same sake.
    .filter((e) => e.event.brandId !== row.brandId)
    .map((e) => ({ e, similarity: listSimilarity(e.event.target!, chart) }))
    .sort((a, b) => b.similarity - a.similarity)[0]
  if (nearest && nearest.similarity >= NAMED_LIKE) {
    const { e } = nearest
    const name = e.expression?.name ?? e.sake.nameRomaji ?? e.sake.nameKanji
    return { kind: 'like', axes, like: { name, rating: e.event.rating } }
  }
  return fit === 'unusual' ? { kind: 'unusual', axes } : { kind: 'axes', axes }
}
