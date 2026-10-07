import { z } from 'zod'
import type { VersionedRecordCodec } from '@/lib/collection/versioned-record'

// A CellarBottle (CONTEXT.md "Cellar", design v1.4 §11, ADR-0024) — one row of
// what a User OWNS: a Sake, how many bottles of it, and whether one is open.
// Distinct from a JournalEntry, which records what they DRANK.
//
// One row per Sake, with a count, because §11 draws "× 2" on a single row and
// the second "Add to cellar" says "Another bottle added · 2 in cellar". The
// store keys the row by `brandId` for the same reason.
//
// `openedAt` belongs to the row, not to a bottle: §11 tracks the one open
// bottle ("Open 4 days · fridge"), and "Finished" on a row with more than one
// bottle drops the count and leaves the rest unopened — exactly the
// prototype's behaviour.
//
// VERSIONED (ADR-0024): stored rows carry `schemaVersion`; see
// `src/lib/collection/versioned-record.ts`. *Nama* is the expected v2 — it
// shortens the "drink soon" threshold from 10 days to 5 — and is left out of
// v1 because nothing can set it yet: the catalogue does not say, and no screen
// asks.
//
// GDPR (ADR-0009 RoPA, cellar row): account-linked personal data, keyed to the
// Clerk user id, permanent until erased; lawful basis consent. Records
// ownership only — no prices, shops or purchase data.

export const CELLAR_BOTTLE_SCHEMA_VERSION = 1 as const

/** The most bottles of one sake a row holds. A typo guard, not a business rule. */
export const MAX_CELLAR_COUNT = 99

export const CellarBottleSchema = z.object({
  schemaVersion: z.literal(CELLAR_BOTTLE_SCHEMA_VERSION),
  /** The Sakenowa brand. Also the row's key in the store. */
  brandId: z.number().int().positive(),
  /** Denormalised at add time, for the same reason a JournalEntry does it: the
   *  cellar must still read "而今 / Jikon" if the mirror later loses the brand,
   *  and the list should not look up every row. */
  sake: z.object({
    nameKanji: z.string().min(1),
    nameRomaji: z.string().nullable(),
  }),
  /** Bottles of this sake, open one included. A row at 0 is deleted instead. */
  count: z.number().int().min(1).max(MAX_CELLAR_COUNT),
  /** Epoch ms the open bottle was opened; `null` when every bottle is sealed. */
  openedAt: z.number().int().nonnegative().nullable(),
  /** Epoch ms the row was first added. */
  addedAt: z.number().int().nonnegative(),
  /** Epoch ms of the last change (another bottle, opened, finished). */
  updatedAt: z.number().int().nonnegative(),
})

export type CellarBottle = z.infer<typeof CellarBottleSchema>

/** v1 is the first version, so there is nothing to upcast yet. */
export const CELLAR_BOTTLE_CODEC: VersionedRecordCodec<CellarBottle> = {
  kind: 'cellar',
  current: CELLAR_BOTTLE_SCHEMA_VERSION,
  upcasters: {},
  schema: CellarBottleSchema,
}
