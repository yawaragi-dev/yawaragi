import { z } from 'zod'

/**
 * Input for the "Log a sake" form (ADR-0020, P5.5-C) — what a maintainer types
 * to create a JournalEntry. Deliberately smaller than a JournalEntry: the
 * server action supplies the derived + audit fields (`id`, `createdAt`, the
 * looked-up flavor `target`, and `occurredAt` = `triedAt`), so the client only
 * provides intent.
 *
 * Rating-based: the log form captures a star rating (the "quick" mode); `notes`
 * and `triedAt` are the "deep" mode extras. `triedAt` is optional — omitted
 * means "I had this just now", and the action defaults it to the current time.
 */
export const JournalLogInputSchema = z.object({
  /** The Sakenowa brand being logged. Its FlavorChart is looked up server-side. */
  brandId: z.number().int().positive(),
  /** 0.5–5 stars in half-star steps — the same scale as a rating TasteEvent
   *  (3 is inert). Kept in lockstep with `RatingTasteEventSchema`; a journal
   *  entry embeds the event it emits, so a mismatch here fails at parse time
   *  with a confusing error one layer down. */
  rating: z.number().min(0.5).max(5).multipleOf(0.5),
  /** Optional free-text note (deep mode). Trimmed-empty is treated as none. */
  notes: z.string().max(2000).optional(),
  /** Epoch ms the sake was tried; defaults to now when omitted (may be backdated). */
  triedAt: z.number().int().nonnegative().optional(),
})

export type JournalLogInput = z.infer<typeof JournalLogInputSchema>
