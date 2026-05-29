import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Sakenowa publishes /flavor-charts as a 6-tuple per brand, each axis a
// float in [0, 1]. The axes are brewers' terms — see the 6-axis vocabulary
// table in CONTEXT.md and the <FlavorAxisLabel /> component. Storage
// keeps the f1..f6 names verbatim; UI translates to romaji + kanji.
const Axis = z.number().min(0).max(1)

export const FlavorChartSchema = WithProvenance.extend({
  brandId: z.number().int().positive(),
  f1: Axis,
  f2: Axis,
  f3: Axis,
  f4: Axis,
  f5: Axis,
  f6: Axis,
})
export type FlavorChart = z.infer<typeof FlavorChartSchema>

export const parseFlavorChart = (input: unknown): FlavorChart => FlavorChartSchema.parse(input)

export const FLAVOR_AXES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const
export type FlavorAxis = (typeof FLAVOR_AXES)[number]
