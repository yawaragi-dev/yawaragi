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
// FlavorProfile (sparse coverage, ADR-0016) cannot be placed in axis space and
// therefore produces no TasteEvent — enforced where events are created, not
// here (the schema requires a target).

const baseFields = {
  /** The FlavorProfile position this event pulls the vector toward (or, for a
   *  negative rating, away from). Snapshotted at event-creation time. */
  target: FlavorProfileSchema,
  /** Epoch milliseconds. Drives the time-decay in the derivation. */
  occurredAt: z.number().int().nonnegative(),
} as const

export const RatingTasteEventSchema = z.object({
  kind: z.literal('rating'),
  /** 1–5 stars. 3 is neutral (inert); below pushes away, above pulls toward. */
  rating: z.number().int().min(1).max(5),
  /** The rated Sake (Sakenowa `brand_id`), kept for the /profile "which inputs
   *  shaped this" view. */
  brandId: z.number().int().positive(),
  ...baseFields,
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
