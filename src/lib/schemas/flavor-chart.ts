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

// Romaji names are locale-invariant (they ARE the Japanese pronunciation),
// so they live in code rather than i18n catalogues. The kanji + locale
// approximations + per-axis caveats go through next-intl. Verified against
// Sakenowa's published type docs on 2026-05-22; see CONTEXT.md "6-axis
// vocabulary" for the full table. f5 reads "dry" (loanword), not "karoyaka"
// (that's an unrelated word also spelled 軽やか).
export const FLAVOR_AXIS_ROMAJI: Readonly<Record<FlavorAxis, string>> = {
  f1: 'hanayaka',
  f2: 'hojun',
  f3: 'juko',
  f4: 'odayaka',
  f5: 'dry',
  f6: 'keikai',
}
