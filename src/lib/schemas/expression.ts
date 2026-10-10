import { z } from 'zod'
import type { VersionedRecordCodec } from '@/lib/collection/versioned-record'

// An Expression (CONTEXT.md; "bottling" in the UI) — one bottling under a Sake
// (the line), or standing alone when the line is unknown. This file holds the
// only kind that exists today: an OWN Expression, one a User added themselves
// because the catalogue does not have it (design v1.6 §9a, answer B2;
// ADR-0025). It is what "Add your bottling", "Keep it anyway" and "Add it
// yourself" create.
//
// `own: true` is a literal on purpose. Sakenowa has no bottling level, so a
// CATALOGUE Expression — curated by hand, each fact with its own source — is a
// different record with a different home (a public table, not a user's hash).
// When it arrives it gets its own schema; this one does not grow a second mode.
//
// `brandId` is the line. `null` means "we do not know its Sake": the scan read
// a name the catalogue lacks, or the User typed one. Linking it later is a
// field change — set `brandId` and `line` — not a migration, which is why the
// design made an own entry a bottling rather than a kind of its own.
//
// No `source` field: like a JournalEntry's note, this is the User's own words,
// shown only to them and labelled "Your own entry" wherever it renders. It is
// never presented as catalogue fact, so ADR-0005's taxonomy does not apply.
//
// VERSIONED (ADR-0024): stored rows carry `schemaVersion`. Grade, rice,
// polishing and size are the expected v2 — §10's "About the sake" will set
// them — and are left out of v1 because no screen asks for them yet.
//
// GDPR (ADR-0009 RoPA, expressions row): account-linked personal data, keyed
// to the Clerk user id, permanent until erased; lawful basis consent. Free
// text, capped, holding a sake's name and its brewery's — not Art. 9 data.
// Private to its author.

export const EXPRESSION_SCHEMA_VERSION = 1 as const

/** The longest name or brewery an own Expression holds. A label's product
 *  name with grade and age attached runs to ~60 characters. */
export const MAX_EXPRESSION_TEXT = 120

const Text = z.string().trim().min(1).max(MAX_EXPRESSION_TEXT)

export const ExpressionSchema = z
  .object({
    schemaVersion: z.literal(EXPRESSION_SCHEMA_VERSION),
    /** Stable id, generated at creation. Also the row's key in the store. */
    id: z.string().min(1),
    /** Added by a User, not curated. Always true today — see the header. */
    own: z.literal(true),
    /** The Sake (line) this is a bottling of — a Sakenowa brand id — or `null`
     *  when the line is unknown. */
    brandId: z.number().int().positive().nullable(),
    /** The line's name, denormalised at link time for the reason a
     *  JournalEntry does it: the page must still read "李白 / Rihaku" if the
     *  mirror later loses the brand. Present exactly when `brandId` is. */
    line: z
      .object({
        nameKanji: z.string().min(1),
        nameRomaji: z.string().nullable(),
      })
      .nullable(),
    /** The bottling's name as the User gave it, in whatever script. */
    name: Text,
    /** The brewery as typed. Only kept without a line — with one, the brewery
     *  is the catalogue's. */
    brewery: Text.optional(),
    /** Epoch ms the Expression was added. */
    createdAt: z.number().int().nonnegative(),
    /** Epoch ms of the last change (renamed, linked to a line). */
    updatedAt: z.number().int().nonnegative(),
  })
  .refine((e) => (e.brandId === null) === (e.line === null), {
    message: 'line and brandId are set together',
    path: ['line'],
  })
  .refine((e) => e.brandId === null || e.brewery === undefined, {
    message: 'a linked bottling takes its brewery from the catalogue',
    path: ['brewery'],
  })

export type Expression = z.infer<typeof ExpressionSchema>

/** v1 is the first version, so there is nothing to upcast yet. */
export const EXPRESSION_CODEC: VersionedRecordCodec<Expression> = {
  kind: 'expressions',
  current: EXPRESSION_SCHEMA_VERSION,
  upcasters: {},
  schema: ExpressionSchema,
}
