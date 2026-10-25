import { z } from 'zod'
import type { VersionedRecordCodec } from '@/lib/collection/versioned-record'
import { MAX_CELLAR_COUNT } from '@/lib/schemas/cellar-bottle'

// A BottleEvent — one dated line of the bottle history (design question AB,
// ADR-0024 "Bottle history" amendment). The Cellar (CellarBottle) is what a
// User owns NOW; the history is what happened to their bottles: added,
// opened, finished, removed. A finished or removed bottle leaves the cellar
// but stays here, so "what did you own" can be answered later (shares by
// grade, style, prefecture, size — never counts over time, design X5 / JMStV).
//
// APPEND-ONLY. An event is written once, under its `id`, and never edited.
// The store is a hash keyed by `id`, so writing the same event twice (a
// restore run twice) is a no-op — the idempotent upsert ADR-0024 §4 needs.
//
// `thing` and `sake` are denormalised like a CellarBottle's: the history must
// still read "而今 / Jikon" after the row is gone, the bottling renamed or the
// mirror has lost the brand. `sizeMl` and `nama` are the row's at the time.
//
// `seeded: true` marks the events written for the bottles already in the
// cellar when the history started (one `added` per row, at the row's
// `addedAt`). They say "these were here", not exactly when each was bought:
// a row that grew from 1 to 3 bottles is seeded as one `added` of 3.
//
// VERSIONED (ADR-0024): stored events carry `schemaVersion`; see
// `src/lib/collection/versioned-record.ts`.
//
// v1 — the shape below.
//
// GDPR (ADR-0009 RoPA, bottle-history row): account-linked personal data,
// keyed to the Clerk user id. Lawful basis: CONSENT, Art. 6(1)(a) — the same
// as the journal and the cellar; it is written only by the User's own cellar
// actions. Retention: until the User deletes their account or asks for
// erasure (no TTL). Minimised: what, how many, which size, nama, and when —
// no price, shop, place or purchase data. Exported, backed up, restored and
// erased with the rest of the collection.

export const BOTTLE_EVENT_SCHEMA_VERSION = 1 as const

export const BOTTLE_EVENT_KINDS = ['added', 'opened', 'finished', 'removed'] as const
export type BottleEventKind = (typeof BOTTLE_EVENT_KINDS)[number]

export const BottleEventSchema = z
  .object({
    schemaVersion: z.literal(BOTTLE_EVENT_SCHEMA_VERSION),
    /** A random UUID, or `seed:<cellar row key>` for a seeded event. */
    id: z.string().min(1).max(160),
    /** Epoch ms the thing happened. */
    at: z.number().int().nonnegative(),
    kind: z.enum(BOTTLE_EVENT_KINDS),
    /** How many bottles it happened to. */
    count: z.number().int().min(1).max(MAX_CELLAR_COUNT),
    /** What the bottles are of: a sake, or one bottling of it (ADR-0025). */
    thing: z.object({
      brandId: z.number().int().positive().nullable(),
      expression: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
    }),
    /** Denormalised from the cellar row, as there. */
    sake: z.object({
      nameKanji: z.string().min(1),
      nameRomaji: z.string().nullable(),
    }),
    sizeMl: z.union([z.literal(180), z.literal(300), z.literal(720), z.literal(1800)]).nullable(),
    nama: z.boolean(),
    /** Written for a bottle already in the cellar when the history began. */
    seeded: z.literal(true).optional(),
  })
  .refine((e) => e.thing.brandId !== null || e.thing.expression !== undefined, {
    message: 'an event with no sake must name its bottling',
    path: ['thing', 'expression'],
  })

export type BottleEvent = z.infer<typeof BottleEventSchema>

/** How a stored BottleEvent is read. v1 is the first version: no upcasters yet. */
export const BOTTLE_EVENT_CODEC: VersionedRecordCodec<BottleEvent> = {
  kind: 'bottle-history',
  current: BOTTLE_EVENT_SCHEMA_VERSION,
  upcasters: {},
  schema: BottleEventSchema,
}
