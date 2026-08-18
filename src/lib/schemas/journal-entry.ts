import { z } from 'zod'
import { type TasteEvent, TasteEventSchema } from '@/lib/schemas/taste-event'

// A JournalEntry (CONTEXT.md, ADR-0020) — one row of a User's TastingJournal:
// the durable, user-facing record of a Sake they tried. The journal is the
// SPINE surface; the TasteMap (derived six-axis vector) and the recommender are
// downstream OUTPUTS of it.
//
// Composition, not extension: a JournalEntry EMBEDS the TasteEvent (#231) it
// emits, rather than spreading its fields. This keeps `TasteEventSchema` the
// single source of the event shape (its discriminated union isn't duplicated),
// and `deriveTasteProfile` folds over `entries.map(journalEntryToTasteEvent)`.
// "A JournalEntry is a TasteEvent + richer fields" (ADR-0020) is the DOMAIN
// statement; `event` is where the primitive lives.
//
// GDPR (ADR-0009, ADR-0020): unlike the anonymous session-scoped TasteEvent
// (ADR-0019, superseded), a JournalEntry is ACCOUNT-LINKED personal data —
// keyed to a Clerk user id, permanent (no TTL). v1 is maintainer-only, so the
// blast radius is one consenting user; erasure = drop the user key (or one
// entry by id), portability = `pnpm journal:export`. Lawful basis: `consent`
// (personalisation). Not Art. 9 data — `notes` is free-text tasting notes only,
// never repurposed for anything sensitive. The implementing account-persistence
// slice updates ADR-0009's RoPA with this operation.

export const JournalEntrySchema = z.object({
  /** Stable per-entry id, generated at creation. Enables edit (upsert by id)
   *  and granular erasure (delete one entry) — a permanent journal needs both,
   *  which is why the store is a hash keyed by id, not an append-only list. */
  id: z.string().min(1),
  /** The TasteEvent this entry emits into `deriveTasteProfile`. */
  event: TasteEventSchema,
  /** The sake's display name, denormalised at log time. A journal is a
   *  permanent record: it must still read "而今 / Jikon" even if that brand is
   *  later removed from the Sakenowa mirror, and the timeline shouldn't do an
   *  N-row brand lookup on every render. `nameRomaji` is nullable (not every
   *  brand has a transliteration), matching `brands.name_romaji`. */
  sake: z.object({
    nameKanji: z.string().min(1),
    nameRomaji: z.string().nullable(),
  }),
  /** Free-text tasting note. Optional — a quick check-in has none. */
  notes: z.string().max(2000).optional(),
  /** Epoch ms — when the User TRIED the sake (user-facing, may be backdated:
   *  "I had this last week"). Distinct from `createdAt`. The entry's decay
   *  ordering uses `event.occurredAt`, which the creating action sets equal to
   *  this so the taste map reflects tasting time, not logging time. */
  triedAt: z.number().int().nonnegative(),
  /** Epoch ms — when the entry was logged. Audit field; not user-editable. */
  createdAt: z.number().int().nonnegative(),
})

export type JournalEntry = z.infer<typeof JournalEntrySchema>

/** The primitive a JournalEntry emits — what `deriveTasteProfile` folds over. */
export const journalEntryToTasteEvent = (entry: JournalEntry): TasteEvent => entry.event

/** Convenience for the derivation path: the embedded events, in the given
 *  order. Callers pass entries already ordered oldest→newest (the store's
 *  `read` guarantees this). */
export const journalEntriesToTasteEvents = (entries: readonly JournalEntry[]): TasteEvent[] =>
  entries.map(journalEntryToTasteEvent)

export const parseJournalEntry = (input: unknown): JournalEntry => JournalEntrySchema.parse(input)
