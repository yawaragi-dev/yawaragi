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
// v3 — `sizeMl` and `nama`, set in the "Add to cellar" sheet (design v1.6.2,
//      decision 2). A row's identity becomes thing + size + nama, and an open
//      bottle lives on a row of its own, so "an opened row is never merged
//      into". v2 → v3 fills `sizeMl: null` (nobody was asked) and
//      `nama: false`; such a sealed row keeps the key it was stored under.
//
// GDPR (ADR-0009 RoPA, cellar row): account-linked personal data, keyed to the
// Clerk user id, permanent until erased; lawful basis consent. Records
// ownership only — no prices, shops or purchase data.

export const CELLAR_BOTTLE_SCHEMA_VERSION = 3 as const

/** The bottle sizes the sheet offers, in millilitres (design v1.6.2). */
export const CELLAR_SIZES = [180, 300, 720, 1800] as const
export type CellarSize = (typeof CELLAR_SIZES)[number]
/** The size the sheet starts on: the four-gō bottle. */
export const DEFAULT_CELLAR_SIZE: CellarSize = 720

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
    /** The bottle size, or `null` on a row added before the sheet asked. */
    sizeMl: z.union([z.literal(180), z.literal(300), z.literal(720), z.literal(1800)]).nullable(),
    /** Unpasteurised: keep it cold, and it is "best finished" sooner once
     *  open. The User's own statement about their bottle. */
    nama: z.boolean(),
    /** Bottles on this row. A row at 0 is deleted instead. */
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
 * What makes two bottles the same row (design v1.6.2): the thing — a sake, or
 * one bottling of it — its size, and whether it is nama. Whether a bottle is
 * open is not part of it; see {@link cellarRowKey}.
 *
 * A sake's or bottling's row with no size and not nama keeps the bare key
 * every earlier row was written under, so no stored row moves.
 */
export function cellarIdentityKey(
  row: Pick<CellarBottle, 'brandId' | 'expression' | 'sizeMl' | 'nama'>,
): string {
  const thing = row.expression ? `x:${row.expression.id}` : String(row.brandId)
  if (row.sizeMl === null && !row.nama) return thing
  return `${thing}|${row.sizeMl ?? 'x'}|${row.nama ? 'n' : 's'}`
}

/**
 * The row's key in the store: its identity, and `|open` for the row holding
 * the open bottle. Sealed and open bottles of the same thing sit on two rows,
 * so adding another bottle never lands on the open one.
 */
export function cellarRowKey(
  row: Pick<CellarBottle, 'brandId' | 'expression' | 'sizeMl' | 'nama' | 'openedAt'>,
): string {
  return row.openedAt === null ? cellarIdentityKey(row) : `${cellarIdentityKey(row)}|open`
}

/** How a stored CellarBottle is read: v1 → v2 stamps the version; v2 → v3 adds
 *  the two fields nobody had been asked for. */
export const CELLAR_BOTTLE_CODEC: VersionedRecordCodec<CellarBottle> = {
  kind: 'cellar',
  current: CELLAR_BOTTLE_SCHEMA_VERSION,
  upcasters: {
    1: (record) => ({ ...record, schemaVersion: 2 }),
    2: (record) => ({ ...record, schemaVersion: 3, sizeMl: null, nama: false }),
  },
  schema: CellarBottleSchema,
}
