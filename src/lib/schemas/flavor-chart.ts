import { z } from 'zod'
import { withProvenance } from './with-provenance'
import { flavorProfileFields } from './flavor-profile'

// FlavorChart mirrors Sakenowa's /flavor-charts: the FlavorProfile 6-tuple
// (`flavor-profile.ts`) attached to a specific brand, plus provenance. The
// axes are brewers' terms — see the 6-axis vocabulary table in CONTEXT.md
// and the <FlavorAxisLabel /> component. Storage keeps the f1..f6 names
// verbatim; UI translates to romaji + kanji.
//
// FlavorChart is the *stored mirror record* (named after Sakenowa's
// endpoint, carries brandId); the bare 6-tuple concept CONTEXT.md calls
// FlavorProfile lives in `flavor-profile.ts` and is composed in below via
// `flavorProfileFields` so the [0, 1] range invariant is declared once.
//
// ADR-0005 binds source to record kind. FlavorChart originates from
// Sakenowa (raw or derived via cosine-similarity inference) or a user
// override — never from an LLM, never from the cross-beverage map.
export const FlavorChartSource = z.enum([
  'sakenowa',
  'sakenowa_inferred',
  'user_corrected',
])
export type FlavorChartSource = z.infer<typeof FlavorChartSource>

export const FlavorChartSchema = withProvenance(FlavorChartSource).extend({
  brandId: z.number().int().positive(),
  ...flavorProfileFields,
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
