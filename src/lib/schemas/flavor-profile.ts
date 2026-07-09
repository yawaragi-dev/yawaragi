import { z } from 'zod'

// The FlavorProfile primitive — the continuous 6-tuple that CONTEXT.md
// names as *the* domain concept ("the continuous 6-tuple attached to a
// Sake, describing its position along the Sakenowa aroma/body/dryness
// axes"). Each axis is a float in [0, 1]. The axes are brewers' terms —
// see the 6-axis vocabulary table in CONTEXT.md and the <FlavorAxisLabel />
// component. Storage keeps the f1..f6 names verbatim; UI translates to
// romaji + kanji.
//
// Why this lives in its own module rather than inside `flavor-chart.ts`:
// three record schemas carry the same 6-tuple — the stored FlavorChart
// (`flavor-chart.ts`, + brandId + wider source union), the CrossBeverageMap
// target (`cross-beverage-map.ts`, + descriptor/beverage/exemplars), and
// the Suggestion's hydrated profile field (`suggestion.ts`, source pinned
// to sakenowa). Before this module each hand-wrote `z.number().min(0).max(1)`
// six times, and they had drifted (one dropped the range entirely). The
// range invariant now lives once; each record composes it via
// `.extend(flavorProfileFields)`.
//
// This is the concept CONTEXT.md calls FlavorProfile and deliberately
// distinguishes from FlavorChart: FlavorChart is the *stored Sakenowa
// mirror record* (named after Sakenowa's /flavor-charts endpoint, carries
// brandId); FlavorProfile is the *bare 6-tuple* attached to a Sake. The
// two were previously bridged by nothing — this module is the bridge.

// A single FlavorAxis value: a float in [0, 1]. The axes are derived from
// Sakenowa's NLP of >1M Japanese-language reviews (see CONTEXT.md); the
// [0, 1] range is a domain invariant, not a storage detail.
export const FlavorAxisValue = z.number().min(0).max(1)

// The raw field shape, exported for composition. Zod's `.extend()` takes a
// raw object of fields (not a ZodObject), so record schemas spread this:
//   withProvenance(...).extend(flavorProfileFields)
// Keeping it a plain object (rather than only a ZodObject) is what lets the
// invariant be reused at the parse seam of every record kind.
export const flavorProfileFields = {
  f1: FlavorAxisValue,
  f2: FlavorAxisValue,
  f3: FlavorAxisValue,
  f4: FlavorAxisValue,
  f5: FlavorAxisValue,
  f6: FlavorAxisValue,
} as const

// The standalone FlavorProfile schema — a bare 6-tuple with no provenance,
// no brandId. Use this when you need the concept on its own (a similarity
// input, a test fixture); use `flavorProfileFields` when composing it into
// a provenance-carrying record.
export const FlavorProfileSchema = z.object(flavorProfileFields)
export type FlavorProfile = z.infer<typeof FlavorProfileSchema>

export const parseFlavorProfile = (input: unknown): FlavorProfile =>
  FlavorProfileSchema.parse(input)
