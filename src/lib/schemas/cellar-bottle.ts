import { z } from 'zod'
import type { VersionedRecordCodec } from '@/lib/collection/versioned-record'

// A CellarBottle (CONTEXT.md "Cellar", design v1.4 §11, ADR-0024) — one row of
// what a User OWNS: a Sake or one bottling of it, how many bottles, and
// whether one is open. Distinct from a JournalEntry, which records what they
// DRANK.
//
// One row per thing a bottle was logged against, with a count (design v1.6.1,
// answer 3): §11 draws "× 2" on a single row, and two bottles of Rihaku plus
// one of Rihaku Wandering Poet are two rows, never merged — they are different
// bottles. `cellarRowKey` is the row's key in the store.
//
// `openedAt` belongs to the row, not to a bottle: §11 tracks the one open
// bottle ("Open 4 days · fridge"), and "Finished" on a row with more than one
// bottle drops the count and leaves the rest unopened — exactly the
// prototype's behaviour.
//
// VERSIONED (ADR-0024): stored rows carry `schemaVersion`; see
// `src/lib/collection/versioned-record.ts`.
//
// v1 — `brandId` (always a number), `sake`, `count`, `openedAt`, timestamps.
// v2 — `brandId` may be `null` and `expression` may name a bottling the User
//      added themselves (ADR-0025). Nothing renamed, so v1 → v2 only stamps the
//      version, and a v1 row keeps the key it was stored under.
//
// *Nama* — it shortens the "drink soon" threshold from 10 days to 5 — and the
// bottle's size ("× 2 · 720 ml") are still left out: nothing can set either
// yet. The catalogue does not say, and no screen asks.
//
// GDPR (ADR-0009 RoPA, cellar row): account-linked personal data, keyed to the
// Clerk user id, permanent until erased; lawful basis consent. Records
// ownership only — no prices, shops or purchase data.

export const CELLAR_BOTTLE_SCHEMA_VERSION = 2 as const

/** The most bottles of one sake a row holds. A typo guard, not a business rule. */
export const MAX_CELLAR_COUNT = 99

export const CellarBottleSchema = z
  .object({
    schemaVersion: z.literal(CELLAR_BOTTLE_SCHEMA_VERSION),
    /** The Sakenowa brand — the sake, or the line a bottling belongs to.
     *  `null` for a bottling whose sake the catalogue lacks. */
    brandId: z.number().int().positive().nullable(),
    /** The bottling these bottles are of, when they are of one (ADR-0025).
     *  `name` is denormalised like `sake`. Absent for bottles of the sake
     *  itself. */
    expression: z.object({ id: z.string().min(1), name: z.string().min(1) }).optional(),
    /** Denormalised at add time, for the same reason a JournalEntry does it: the
     *  cellar must still read "而今 / Jikon" if the mirror later loses the brand,
     *  and the list should not look up every row. With no sake, the bottling's
     *  own name stands in, as in a JournalEntry. */
    sake: z.object({
      nameKanji: z.string().min(1),
      nameRomaji: z.string().nullable(),
    }),
    /** Bottles on this row, open one included. A row at 0 is deleted instead. */
    count: z.number().int().min(1).max(MAX_CELLAR_COUNT),
    /** Epoch ms the open bottle was opened; `null` when every bottle is sealed. */
    openedAt: z.number().int().nonnegative().nullable(),
    /** Epoch ms the row was first added. */
    addedAt: z.number().int().nonnegative(),
    /** Epoch ms of the last change (another bottle, opened, finished). */
    updatedAt: z.number().int().nonnegative(),
  })
  .refine((b) => b.brandId !== null || b.expression !== undefined, {
    message: 'a cellar row with no sake must name its bottling',
    path: ['expression'],
  })

export type CellarBottle = z.infer<typeof CellarBottleSchema>

/**
 * The row's key in the store. A sake's row keeps the bare brand id every v1
 * row was written under, so no stored row moves; a bottling's row is keyed by
 * the bottling, with a prefix no brand id can collide with.
 */
export function cellarRowKey(row: Pick<CellarBottle, 'brandId' | 'expression'>): string {
  return row.expression ? `x:${row.expression.id}` : String(row.brandId)
}

/** How a stored CellarBottle is read: v1 → v2 only stamps the version. */
export const CELLAR_BOTTLE_CODEC: VersionedRecordCodec<CellarBottle> = {
  kind: 'cellar',
  current: CELLAR_BOTTLE_SCHEMA_VERSION,
  upcasters: {
    1: (record) => ({ ...record, schemaVersion: 2 }),
  },
  schema: CellarBottleSchema,
}
