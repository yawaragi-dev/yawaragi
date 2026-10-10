import { z } from 'zod'
import { FlavorProfileSchema } from '@/lib/schemas/flavor-profile'

// A TasteEvent (CONTEXT.md) — a single dated interaction that feeds a User's
// TasteProfile: a Sake rating, an accepted scan result, or a cross-beverage
// seed. The TasteProfile is DERIVED from a User's TasteEvents by a pure fold
// (see `src/lib/taste/derive-taste-profile.ts` + ADR-0019); events are the
// stored thing, the vector is not.
//
// GDPR (ADR-0009): a TasteEvent is pseudonymous personal data — keyed to an
// anonymous session (`yawaragi_session`), never a Clerk account, in v1
// (ADR-0019). Lawful basis: `consent` (personalisation). Retention: the
// session TTL; erasure = dropping the session key. Not Art. 9 data. No new
// field here holds anything beyond a Sake reference the visitor already
// interacted with plus its public FlavorProfile snapshot.
//
// `target` is the FlavorProfile position the event points at — the rated /
// scanned Sake's profile, or the CrossBeverageMap position for the descriptor.
// It is snapshotted onto the event so the derivation stays a pure function of
// stored events with no DB lookup. An interaction with a Sake that has NO
// FlavorProfile (sparse coverage, ADR-0016) cannot be placed in axis space.
// For a scan accept or a seed that means no TasteEvent at all. A RATING is the
// exception (ADR-0024): a journal entry IS a rating event, and refusing to log
// a tasting because the catalogue has no chart for the bottle would make half
// the catalogue unloggable. So a rating's `target` may be `null` — the entry is
// recorded, counts as a tasting, and the fold skips it because there is no
// position to pull toward.
//
// The same holds one step further out (ADR-0025): a rating of a bottling the
// User added themselves, whose Sake the catalogue does not have, has no brand
// at all. Its `brandId` is `null`, and so is its `target` — with no Sake there
// is no chart to take a position from.

const baseFields = {
  /** The FlavorProfile position this event pulls the vector toward (or, for a
   *  negative rating, away from). Snapshotted at event-creation time. */
  target: FlavorProfileSchema,
  /** Epoch milliseconds. Drives the time-decay in the derivation. */
  occurredAt: z.number().int().nonnegative(),
} as const

export const RatingTasteEventSchema = z
  .object({
  ...baseFields,
  kind: z.literal('rating'),
  /** 0.5–5 stars in half-star steps (design v1.4 §5). 3 is neutral (inert);
   *  below pushes away, above pulls toward. `multipleOf(0.5)` is what makes
   *  this a *scale* rather than an arbitrary float — without it a caller
   *  could persist 3.7 and the star row would have nothing to render. */
  rating: z.number().min(0.5).max(5).multipleOf(0.5),
  /** The rated Sake (Sakenowa `brand_id`), kept for the /profile "which inputs
   *  shaped this" view. `null` for an own bottling whose Sake is unknown. */
  brandId: z.number().int().positive().nullable(),
  /** As `baseFields.target`, but `null` when the rated Sake has no
   *  FlavorProfile — see the header. The fold skips a null target. */
  target: FlavorProfileSchema.nullable(),
  })
  .refine((e) => e.brandId !== null || e.target === null, {
    message: 'a rating with no sake has no flavor position',
    path: ['target'],
  })

export const ScanAcceptTasteEventSchema = z.object({
  kind: z.literal('scan_accept'),
  brandId: z.number().int().positive(),
  ...baseFields,
})

export const CrossBeverageSeedTasteEventSchema = z.object({
  kind: z.literal('cross_beverage_seed'),
  /** The Western descriptor the visitor seeded from (e.g. "smoky"). */
  descriptor: z.string().min(1),
  ...baseFields,
})

export const TasteEventSchema = z.discriminatedUnion('kind', [
  RatingTasteEventSchema,
  ScanAcceptTasteEventSchema,
  CrossBeverageSeedTasteEventSchema,
])

export type TasteEvent = z.infer<typeof TasteEventSchema>
export type TasteEventKind = TasteEvent['kind']

export const parseTasteEvent = (input: unknown): TasteEvent => TasteEventSchema.parse(input)
