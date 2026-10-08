import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import {
  type AxisQuickTag,
  CONTEXT_QUICK_TAGS,
  type ContextQuickTag,
  type QuickTag,
} from '@/lib/schemas/journal-entry'

/** How many of the bottle's own axes the panel offers as chips. */
const AXIS_CHIPS = 2

/**
 * The quick chips §5's panel offers for one bottle: its two strongest flavor
 * axes ("yes, I got that too"), then the serving context, which fits any sake.
 * A sake with no flavor chart gets the context only.
 *
 * Ties keep axis order, so the chips never reorder between renders. Which
 * chips are worth offering at all is an open question (#367); this is the
 * smallest set that is never nonsense for the bottle in front of you.
 */
export function quickTagsFor(
  chart: Readonly<Record<FlavorAxis, number>> | null,
): (AxisQuickTag | ContextQuickTag)[] {
  if (!chart) return [...CONTEXT_QUICK_TAGS]
  const strongest = [...FLAVOR_AXES]
    // Array#sort is stable, so equal values keep axis order.
    .sort((a, b) => chart[b] - chart[a])
    .slice(0, AXIS_CHIPS)
    .map((axis): AxisQuickTag => `axis:${axis}`)
  return [...strongest, ...CONTEXT_QUICK_TAGS]
}

/** Whether a chip names one of the bottle's flavor axes. */
export function isAxisQuickTag(tag: QuickTag): tag is AxisQuickTag {
  return tag.startsWith('axis:')
}

/** The axis an axis chip names. */
export function quickTagAxis(tag: AxisQuickTag): FlavorAxis {
  return tag.slice('axis:'.length) as FlavorAxis
}
