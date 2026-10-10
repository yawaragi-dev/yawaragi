import { z } from 'zod'
import type { VersionedRecordCodec } from '@/lib/collection/versioned-record'
import { DetailedNotesSchema } from '@/lib/schemas/detailed-notes'
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
//
// VERSIONED (ADR-0024): a stored entry carries `schemaVersion` and is upcast on
// read by `JOURNAL_ENTRY_CODEC` below. Changing this shape means bumping
// `JOURNAL_ENTRY_SCHEMA_VERSION` and adding the upcaster from the old version —
// never editing a field in place, because every entry already in Upstash (and
// in every backup) was written in the old shape.
//
// v1 — no `schemaVersion` field: id, event, sake, notes, triedAt, createdAt.
// v2 — `schemaVersion: 2`, plus optional `tags` (§5's quick chips), `detail`
//      (§10's sheet) and `updatedAt`. Nothing renamed, so v1 → v2 only stamps
//      the version.
// v3 — `schemaVersion: 3`, plus optional `expression`: the bottling the
//      tasting was logged against (ADR-0025). A rating's `brandId` may now be
//      `null`, for a bottling whose Sake is unknown. Nothing renamed, so
//      v2 → v3 only stamps the version.

/**
 * §5's quick chips — the user's own one-tap notes about a tasting. Stable keys;
 * the words live in `messages/*.json` (`tasting.quickTags`, and
 * `flavorAxis.<axis>.label` for the axis chips). Unrelated to Sakenowa's
 * FlavorTags, and they never feed the TasteProfile.
 *
 * The panel offers this bottle's two strongest axes plus the serving context
 * (`quickTagsFor`). The design's fixed "Sour apple · Cider-like · Warm · With
 * food" fitted its demo bottle and no other; those two keys are retired from
 * the panel but stay valid here, so an entry that already carries them still
 * reads instead of landing in `rejected`.
 */
export const AXIS_QUICK_TAGS = [
  'axis:f1',
  'axis:f2',
  'axis:f3',
  'axis:f4',
  'axis:f5',
  'axis:f6',
] as const
export const CONTEXT_QUICK_TAGS = ['chilled', 'warm', 'withFood'] as const
const RETIRED_QUICK_TAGS = ['sourApple', 'ciderLike'] as const
export const QUICK_TAGS = [...AXIS_QUICK_TAGS, ...CONTEXT_QUICK_TAGS, ...RETIRED_QUICK_TAGS] as const
export type QuickTag = (typeof QUICK_TAGS)[number]
export type AxisQuickTag = (typeof AXIS_QUICK_TAGS)[number]
export type ContextQuickTag = (typeof CONTEXT_QUICK_TAGS)[number]

export const JOURNAL_ENTRY_SCHEMA_VERSION = 3 as const

export const JournalEntrySchema = z
  .object({
  /** The record's stored-shape version (ADR-0024). Always the current one
   *  after a read — older records are upcast before they get here. */
  schemaVersion: z.literal(JOURNAL_ENTRY_SCHEMA_VERSION),
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
  /** The bottling this tasting was logged against, when it was one (design
   *  v1.6: "the tasting is stored on the bottling"). `name` is denormalised
   *  like `sake`, so the journal still reads if the bottling is removed.
   *  Absent for a tasting of the Sake itself. With an `expression`, `sake`
   *  holds the line's name — or, when the line is unknown, the bottling's own
   *  name, so every surface that prints `sake` still has something true to
   *  print. */
  expression: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
  /** Free-text tasting note. Optional — a quick check-in has none. */
  notes: z.string().max(2000).optional(),
  /** §5's quick chips, each at most once. Absent when none are picked. */
  tags: z
    .array(z.enum(QUICK_TAGS))
    .max(QUICK_TAGS.length)
    .refine((list) => new Set(list).size === list.length, 'duplicate tag')
    .optional(),
  /** §10's detailed notes. Absent until a part of the sheet is filled. */
  detail: DetailedNotesSchema.optional(),
  /** Epoch ms — when the User TRIED the sake (user-facing, may be backdated:
   *  "I had this last week"). Distinct from `createdAt`. The entry's decay
   *  ordering uses `event.occurredAt`, which the creating action sets equal to
   *  this so the taste map reflects tasting time, not logging time. */
  triedAt: z.number().int().nonnegative(),
  /** Epoch ms — when the entry was logged. Audit field; not user-editable. */
  createdAt: z.number().int().nonnegative(),
  /** Epoch ms — the last edit (re-rate, note, tags, detailed notes). Absent on
   *  an entry never edited since it was logged. */
  updatedAt: z.number().int().nonnegative().optional(),
  })
  // A tasting is of something: a Sake (the event's brand), a bottling, or both.
  .refine((e) => e.event.kind !== 'rating' || e.event.brandId !== null || e.expression !== undefined, {
    message: 'a tasting with no sake must name its bottling',
    path: ['expression'],
  })

export type JournalEntry = z.infer<typeof JournalEntrySchema>

/** How a stored JournalEntry is read: each step so far only stamps the version. */
export const JOURNAL_ENTRY_CODEC: VersionedRecordCodec<JournalEntry> = {
  kind: 'journal',
  current: JOURNAL_ENTRY_SCHEMA_VERSION,
  upcasters: {
    1: (record) => ({ ...record, schemaVersion: 2 }),
    2: (record) => ({ ...record, schemaVersion: 3 }),
  },
  schema: JournalEntrySchema,
}

/** The primitive a JournalEntry emits — what `deriveTasteProfile` folds over. */
export const journalEntryToTasteEvent = (entry: JournalEntry): TasteEvent => entry.event

/** Convenience for the derivation path: the embedded events, in the given
 *  order. Callers pass entries already ordered oldest→newest (the store's
 *  `read` guarantees this). */
export const journalEntriesToTasteEvents = (entries: readonly JournalEntry[]): TasteEvent[] =>
  entries.map(journalEntryToTasteEvent)

export const parseJournalEntry = (input: unknown): JournalEntry => JournalEntrySchema.parse(input)
