import 'server-only'
import { cache } from 'react'
import { lookupFlavorChart } from '@/lib/sakenowa/catalogue-reads'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { catalogueAxisStats } from '@/lib/taste/catalogue-mean'
import type { PairingDeps } from './pairing-of'

/**
 * A line's chart, or `null` when it has none — or when the mirror cannot be
 * reached. A pairing is a nice-to-have on a page that is the visitor's own
 * record; a lookup failure must not take the page down with it. Deduped per
 * request, so a page that also draws the chart reads it once.
 */
export const lookupFlavorChartSafe = cache(async (brandId: number): Promise<FlavorChart | null> => {
  try {
    return await lookupFlavorChart(brandId)
  } catch {
    return null
  }
})

/** The catalogue reads behind `pairingOf`, for server code. */
export const cataloguePairingDeps: PairingDeps = {
  lookupChart: lookupFlavorChartSafe,
  axisStats: catalogueAxisStats,
}
