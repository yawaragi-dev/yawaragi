import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { CLEARLY_DIFFERENT_Z } from '@/lib/taste/clearly-different'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * §8's browse filters (design v1.8, M), read from the address so Search stays
 * a page of links and a GET form with no client state: a prefecture, and one
 * flavor axis the sake clearly stands out on, above or below the catalogue.
 */
export type FlavorDirection = 'more' | 'less'
export interface FlavorFilter {
  axis: FlavorAxis
  direction: FlavorDirection
}
export interface BrowseFilter {
  areaId: number | null
  flavor: FlavorFilter | null
}

type Param = string | string[] | undefined

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** Anything that is not a prefecture or an axis is dropped, never an error. */
export function parseBrowseFilter(params: { pref?: Param; flavor?: Param }): BrowseFilter {
  const pref = Number(first(params.pref))
  const areaId = Number.isInteger(pref) && getPrefectureNames(pref) !== null && pref > 0 ? pref : null
  const match = /^(more|less)-(f[1-6])$/.exec(first(params.flavor) ?? '')
  const axis = match?.[2] as FlavorAxis | undefined
  const flavor =
    match && axis && (FLAVOR_AXES as readonly string[]).includes(axis)
      ? { axis, direction: match[1] as FlavorDirection }
      : null
  return { areaId, flavor }
}

export function hasBrowseFilter(filter: BrowseFilter): boolean {
  return filter.areaId !== null || filter.flavor !== null
}

/**
 * The chart value a sake must reach (more) or stay under (less) on the axis:
 * the catalogue's average, one "clearly different" spread away. Never the raw
 * chart value on its own, which Sakenowa scales per sake (v1.8.1, M).
 */
export function flavorBound(stats: { mean: FlavorProfile; sd: FlavorProfile }, flavor: FlavorFilter): number {
  const step = CLEARLY_DIFFERENT_Z * stats.sd[flavor.axis]
  return flavor.direction === 'more' ? stats.mean[flavor.axis] + step : stats.mean[flavor.axis] - step
}

/** The search params for `current` with one filter changed (`null` clears it). */
export function withFilter(current: BrowseFilter, change: Partial<BrowseFilter>): Record<string, string> {
  const next = { ...current, ...change }
  return {
    ...(next.areaId !== null ? { pref: String(next.areaId) } : {}),
    ...(next.flavor !== null ? { flavor: `${next.flavor.direction}-${next.flavor.axis}` } : {}),
  }
}
