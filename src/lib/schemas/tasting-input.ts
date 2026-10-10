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

/**
 * "Tap a star and it's logged" — a new tasting of one sake, rated. With an
 * `expressionId`, a tasting of that bottling of the sake (design v1.6 §9a:
 * "the tasting is stored on the bottling").
 */
export const RateTastingInputSchema = z.object({
  brandId: z.number().int().positive(),
  rating: Rating,
  expressionId: z.string().min(1).max(64).optional(),
})
export type RateTastingInput = z.infer<typeof RateTastingInputSchema>

/** The earliest tasting day the journal accepts. */
export const EARLIEST_TASTING_DAY = '2000-01-01'

/**
 * A tasting day, `YYYY-MM-DD`, as the visitor's calendar shows it. A real
 * calendar date (no 30 February), not before {@link EARLIEST_TASTING_DAY}.
 * "Not in the future" needs a clock, so the action checks it.
 */
export const TastingDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => {
    const [y, m, d] = day.split('-').map(Number) as [number, number, number]
    const at = new Date(Date.UTC(y, m - 1, d))
    return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d
  }, 'not a calendar date')
  .refine((day) => day >= EARLIEST_TASTING_DAY, 'too early')

/**
 * What can change on a logged tasting after the first tap: the rating
 * ("re-rating updates the same entry"), the note, the quick tags, §10's
 * detailed notes, and the day it was tasted. Every field optional; an absent field is left as it is.
 * `notes: ''` clears the note, `tags: []` clears the tags, and a `detail`
 * replaces the whole sheet (the client holds the sheet, so it sends it whole).
 */
export const TastingPatchSchema = z
  .object({
    rating: Rating.optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.enum(QUICK_TAGS)).max(QUICK_TAGS.length).optional(),
    detail: DetailedNotesSchema.optional(),
    /** Move the tasting to another day — "I had this last week". */
    triedOn: TastingDaySchema.optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), 'empty patch')
export type TastingPatch = z.infer<typeof TastingPatchSchema>
