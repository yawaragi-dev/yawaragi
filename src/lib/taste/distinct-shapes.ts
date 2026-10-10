import type { FlavorAxes } from '@/lib/flavor/flavor-similarity'
import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { PalateLean } from '@/lib/taste/palate-read'

/**
 * §12 "Sakes to try next", before any pick: "Three clear, different shapes to
 * start with." With no palate there is nothing to rank against, so instead of
 * an empty section the screen shows how far apart sakes can be.
 *
 * Each shape is a direction in the six-axis space, read against the
 * catalogue's average — so "dry" means drier than most, not a high f5 that
 * every sake also has. The pick for a shape is the sake that goes furthest in
 * that direction. The three directions are ours (an editorial choice, like the
 * cold-start drinks); the sakes and their axes are Sakenowa's.
 */
const SHAPES: readonly Partial<Record<FlavorAxis, number>>[] = [
  // Aromatic: hanayaka up, odayaka (restrained) down.
  { f1: 1, f4: -0.5 },
  // Rich: juko and hojun up, keikai down.
  { f3: 1, f2: 0.5, f6: -0.5 },
  // Dry: dry up with a light finish, aroma down.
  { f5: 1, f6: 0.5, f1: -0.5 },
]

export interface ShapeCandidate extends FlavorAxes {
  readonly brandId: number
  readonly nameRomaji: string | null
}

export interface DistinctShape<C extends ShapeCandidate> {
  readonly candidate: C
  /** The two axes this sake stands out on against the catalogue average. */
  readonly lean: PalateLean
}

export function pickDistinctShapes<C extends ShapeCandidate>(pool: readonly C[]): DistinctShape<C>[] {
  if (pool.length < SHAPES.length) return []

  const mean = Object.fromEntries(
    FLAVOR_AXES.map((axis) => [axis, pool.reduce((sum, c) => sum + c[axis], 0) / pool.length]),
  ) as Record<FlavorAxis, number>
  const deviation = (c: C) => Object.fromEntries(FLAVOR_AXES.map((axis) => [axis, c[axis] - mean[axis]])) as Record<FlavorAxis, number>

  // A Latin name is something an English reader can say back; fall back to
  // the whole catalogue only if too few have one.
  const named = pool.filter((c) => c.nameRomaji)
  const eligible = named.length >= SHAPES.length ? named : pool

  const taken = new Set<number>()
  const picks: DistinctShape<C>[] = []
  for (const direction of SHAPES) {
    let best: C | null = null
    let bestScore = -Infinity
    for (const c of eligible) {
      if (taken.has(c.brandId)) continue
      const dev = deviation(c)
      const score = FLAVOR_AXES.reduce((sum, axis) => sum + (direction[axis] ?? 0) * dev[axis], 0)
      // Ties go to the lower brandId, so the screen is stable between renders.
      if (score > bestScore || (score === bestScore && best && c.brandId < best.brandId)) {
        best = c
        bestScore = score
      }
    }
    if (!best) return []
    taken.add(best.brandId)
    const dev = deviation(best)
    const [top, second] = [...FLAVOR_AXES].sort((a, b) => dev[b] - dev[a] || FLAVOR_AXES.indexOf(a) - FLAVOR_AXES.indexOf(b))
    picks.push({ candidate: best, lean: { top, second } })
  }
  return picks
}
