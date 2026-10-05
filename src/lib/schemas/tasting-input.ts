import { z } from 'zod'
import { DetailedNotesSchema } from '@/lib/schemas/detailed-notes'
import { QUICK_TAGS } from '@/lib/schemas/journal-entry'

/**
 * Inputs to the one-tap tasting actions (design v1.4 §5, ADR-0024). Smaller
 * than a JournalEntry on purpose: the server supplies the id, the clock, the
 * denormalised sake name and the flavor target — the client only says what
 * the person did.
 */

/** Same scale as a rating TasteEvent: 0.5–5 in half steps. */
const Rating = z.number().min(0.5).max(5).multipleOf(0.5)

/** "Tap a star and it's logged" — a new tasting of one sake, rated. */
export const RateTastingInputSchema = z.object({
  brandId: z.number().int().positive(),
  rating: Rating,
})
export type RateTastingInput = z.infer<typeof RateTastingInputSchema>

/**
 * What can change on a logged tasting after the first tap: the rating
 * ("re-rating updates the same entry"), the note, the quick tags, and §10's
 * detailed notes. Every field optional; an absent field is left as it is.
 * `notes: ''` clears the note, `tags: []` clears the tags, and a `detail`
 * replaces the whole sheet (the client holds the sheet, so it sends it whole).
 */
export const TastingPatchSchema = z
  .object({
    rating: Rating.optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.enum(QUICK_TAGS)).max(QUICK_TAGS.length).optional(),
    detail: DetailedNotesSchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), 'empty patch')
export type TastingPatch = z.infer<typeof TastingPatchSchema>
