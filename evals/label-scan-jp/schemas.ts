import { z } from 'zod'
import { ScanBottlingSchema, ScanDrinkSchema, ScanSubjectSchema } from '@/lib/schemas/label-scan-extraction'

/**
 * Phase 3 / S5 (#110) — Zod shapes for the `evals/label-scan-jp/` harness.
 *
 * The runner loads `ground-truth.json` (a flat map keyed by photo filename)
 * and parses it against `GroundTruthFileSchema` at start-up. A drifting
 * ground-truth file — a missing field, an empty name, a photo entry with
 * uncleared rights — fails HERE with a readable Zod error, not silently in
 * the metric. Same defence-in-depth posture as `evals/suggest-jp/schemas.ts`.
 *
 * Nothing here imports `server-only` or the vision seam, so the schema (and
 * the ground-truth file it validates) stays loadable from a plain Node
 * context without the `react-server` condition the runner needs.
 */

/**
 * How a photo entered the corpus, and under what rights. This is the
 * machine-checkable half of the AC "Photo provenance documented … each
 * photo's rights cleared"; the README carries the human-readable half.
 *
 * - `maintainer_own_bottle` — the maintainer photographed a bottle they own.
 *   The default and cleanest source: the maintainer holds the copyright in
 *   their own photograph outright.
 * - `maintainer_shop_photo` — the maintainer photographed a bottle on a shop
 *   shelf. The photograph is theirs all the same; the bottle is not. Glass
 *   in a shop reflects whoever holds the phone, so check for it and blur.
 * - `maintainer_menu_photo` — the maintainer photographed a printed menu at
 *   a restaurant or bar. The photograph is theirs; the page's wording and
 *   layout are the venue's. Frame the page only — no staff, no other guests.
 * - `public_domain` — a product shot in the public domain (age, or an
 *   explicit PD dedication). `attribution` records where it came from.
 * - `cc0` / `cc_by` — Creative-Commons-licensed. `cc_by` REQUIRES a filled
 *   `attribution` string (enforced below).
 * - `press_kit_licensed` — a brewery/importer press-kit image whose licence
 *   permits this use. `attribution` records the grant.
 * - `synthetic_smoke_fixture` — NOT a real eval photo. A deterministic
 *   pipeline-smoke image (see `fixtures/`) used only to prove the CLI runs
 *   end-to-end. Never counts toward the 20-photo corpus target.
 */
export const PhotoRightsSourceSchema = z.enum([
  'maintainer_own_bottle',
  'maintainer_shop_photo',
  'maintainer_menu_photo',
  'public_domain',
  'cc0',
  'cc_by',
  'press_kit_licensed',
  'synthetic_smoke_fixture',
])

export type PhotoRightsSource = z.infer<typeof PhotoRightsSourceSchema>

/**
 * The ground truth for a single photo: what a correct extraction should say,
 * plus the rights/provenance record that lets the photo ship at all.
 *
 * `name_ja` / `brewery_ja` are the fields the scan action extracts and the
 * Sakenowa lookup joins on — always in original Japanese script (kanji /
 * kana) or Latin verbatim, per the vision system prompt. They mirror the
 * `LabelScanExtraction` fields exactly so the metric compares like with like.
 */
/**
 * What the photo shows. A scan is only as good as the side of the bottle the
 * visitor happened to point at, so the runner reports every metric per view.
 *
 * - `front` — the front label, square on.
 * - `side` — the label turned to one side, part of it out of frame.
 * - `back_ja` — a Japanese back or side label (the regulatory block).
 * - `back_import` — the importer's German or French back label, which names
 *   the sake and its maker in Latin script only. What a visitor in the EU
 *   is as likely to photograph as the front.
 * - `other` — anything else (a neck band, a cap).
 */
export const PhotoViewSchema = z.enum(['front', 'side', 'back_ja', 'back_import', 'other'])

export type PhotoView = z.infer<typeof PhotoViewSchema>

/**
 * What is in the frame. Left out, the photo is of one bottle — which is what
 * the scan is built for and what every photo was until 2026-10-13.
 *
 * - `one_bottle` — one bottle (or its box) is the subject. Other bottles may
 *   stand at the edges of a shop shelf; they are not what was photographed.
 * - `several_bottles` — two or more different bottles, none of them merely
 *   at the edge. `items` lists each one.
 * - `menu` — a printed menu or drinks list, not a bottle. `items` lists the
 *   drinks legibly printed on it. Menu scan is a deferred feature (design §7).
 */
export const PhotoSubjectSchema = z.enum(['one_bottle', 'several_bottles', 'menu'])

export type PhotoSubject = z.infer<typeof PhotoSubjectSchema>

/**
 * What the drink is. The catalogue holds sake only, so anything else has no
 * right sake to land on. Kept as a closed list so that a later "this is not
 * sake" feature can be scored against it; `other` is the escape hatch.
 */
export const DrinkSchema = z.enum(['sake', 'shochu', 'awamori', 'umeshu', 'liqueur', 'other'])

export type Drink = z.infer<typeof DrinkSchema>

/** One bottle in a `several_bottles` photo, or one line of a `menu`. */
export const PhotoItemSchema = z.object({
  name_ja: z.string().min(1),
  /** Left out where a menu does not print the maker and it is not known. */
  brewery_ja: z.string().min(1).optional(),
  /** Left out, the item is sake. */
  drink: DrinkSchema.optional(),
  /** The catalogue rows for this item; `[]` when the catalogue has none. */
  expectedBrandIds: z.array(z.number().int().positive()),
  /**
   * `several_bottles` only: this bottle is clearly the subject — centred,
   * largest, in focus. At most one item; none when the bottles share the frame.
   */
  main: z.boolean().optional(),
})

export type PhotoItem = z.infer<typeof PhotoItemSchema>

export const GroundTruthEntrySchema = z
  .object({
    name_ja: z.string().min(1),
    brewery_ja: z.string().min(1),
    /**
     * Groups the photos of one physical bottle, for the per-bottle table and
     * the pairs eval. Sake bottles only: a menu or a photo of several bottles
     * is not one bottle, and the pairs eval has nothing to say about a bottle
     * that is not sake.
     */
    bottle: z.string().min(1).optional(),
    view: PhotoViewSchema.optional(),
    subject: PhotoSubjectSchema.optional(),
    /** `one_bottle` only: what the bottle holds. Left out, it is sake. */
    drink: DrinkSchema.optional(),
    /** `several_bottles` and `menu` only: everything legible in the frame. */
    items: z.array(PhotoItemSchema).optional(),
    /**
     * The catalogue rows (`brands.brand_id`) a correct scan may land on.
     * `[]` says the bottle is NOT in the catalogue, where the right answer is
     * no match at all. Left out, the photo is scored on extraction only.
     */
    expectedBrandIds: z.array(z.number().int().positive()).optional(),
    /**
     * Other readings that are also right — a label that prints its brand in
     * kanji, katakana and Latin has three correct answers. Accuracy is the
     * best score over `name_ja` / `brewery_ja` and these.
     */
    also: z
      .object({
        name_ja: z.array(z.string().min(1)).optional(),
        brewery_ja: z.array(z.string().min(1)).optional(),
      })
      .optional(),
    provenance: z.object({
      source: PhotoRightsSourceSchema,
      /**
       * Must be `true` for any photo that is not the synthetic smoke
       * fixture — the runner refuses to score an uncleared photo. The
       * superRefine below enforces this so a maintainer can't drop in a
       * photo with `rightsCleared: false` and quietly have it evaluated.
       */
      rightsCleared: z.boolean(),
      /** Source URL / bottle description / licence grant. */
      attribution: z.string().optional(),
      notes: z.string().optional(),
    }),
  })
  .superRefine((entry, ctx) => {
    const { source, attribution } = entry.provenance
    // NOTE: `rightsCleared` is NOT hard-failed here on purpose. A placeholder
    // entry ships with `rightsCleared: false` so it documents the convention
    // inline without crashing `.parse()`. The RUNNER enforces the policy: an
    // entry with `rightsCleared: false` is SKIPPED (never sent to a provider,
    // never scored) with a visible "rights not cleared" line. Flipping the
    // flag to `true` once the rights actually exist is what opts a photo in.
    if ((source === 'cc_by' || source === 'press_kit_licensed') && !attribution) {
      ctx.addIssue({
        code: 'custom',
        path: ['provenance', 'attribution'],
        message: `source "${source}" requires a non-empty attribution string.`,
      })
    }

    const subject = entry.subject ?? 'one_bottle'
    const items = entry.items ?? []
    if (subject === 'one_bottle') {
      if (entry.items) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'a photo of one bottle has no items; set subject.' })
      }
      if ((entry.drink ?? 'sake') !== 'sake' && entry.bottle) {
        ctx.addIssue({ code: 'custom', path: ['bottle'], message: 'bottle groups sake bottles only.' })
      }
      return
    }
    if (entry.drink) {
      ctx.addIssue({ code: 'custom', path: ['drink'], message: `a ${subject} photo says what each item is, in items.` })
    }
    if (entry.bottle) {
      ctx.addIssue({ code: 'custom', path: ['bottle'], message: `a ${subject} photo is not one bottle.` })
    }
    if (items.length < (subject === 'several_bottles' ? 2 : 1)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: subject === 'several_bottles' ? 'list at least two bottles.' : 'list at least one drink on the menu.',
      })
    }
    const mains = items.filter((item) => item.main).length
    if (mains > (subject === 'several_bottles' ? 1 : 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: subject === 'several_bottles' ? 'at most one bottle is the main one.' : 'a menu has no main item.',
      })
    }
  })

export type GroundTruthEntry = z.infer<typeof GroundTruthEntrySchema>

/**
 * The four kinds of photo the eval reports apart. `sake_bottle` is the
 * headline ("right of N"); the other three each have their own right answer
 * (see `judge.ts`) and their own lines in the output.
 */
export type PhotoKind = 'sake_bottle' | 'other_drink' | 'several_bottles' | 'menu'

export function photoKind(entry: Pick<GroundTruthEntry, 'subject' | 'drink'>): PhotoKind {
  if (entry.subject === 'several_bottles' || entry.subject === 'menu') return entry.subject
  return (entry.drink ?? 'sake') === 'sake' ? 'sake_bottle' : 'other_drink'
}

/**
 * The whole ground-truth file: a map from photo filename (as it appears in
 * `photos/` or `fixtures/`) to its ground-truth entry. Keyed by filename so a
 * maintainer adding a photo edits exactly one obvious place, and so the
 * runner can pair each file on disk with its expected answer by name.
 */
export const GroundTruthFileSchema = z.record(z.string().min(1), GroundTruthEntrySchema)

export type GroundTruthFile = z.infer<typeof GroundTruthFileSchema>

/**
 * One model read of one photo, kept so the next run need not pay for it
 * again. `photoSha` ties it to the photo's bytes: replace the photo and the
 * read is stale.
 */
export const SavedReadSchema = z.union([
  z.object({
    photoSha: z.string().min(1),
    name_ja: z.string().min(1),
    brewery_ja: z.string().min(1),
    brewery_printed: z.boolean().optional(),
    subject: ScanSubjectSchema.optional(),
    drink: ScanDrinkSchema.optional(),
    bottling: ScanBottlingSchema.optional(),
    other_names: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1),
    latencyMs: z.number().int().nonnegative(),
  }),
  z.object({ photoSha: z.string().min(1), error: z.string() }),
])

export type SavedRead = z.infer<typeof SavedReadSchema>

/**
 * `recordings/reads.json`: provider key → the prompt fingerprint its reads
 * were made with, and the reads by photo filename. A provider's reads are
 * dropped as a whole when the prompt changes.
 */
export const SavedReadsFileSchema = z.object({
  providers: z.record(
    z.string().min(1),
    z.object({
      fingerprint: z.string().min(1),
      reads: z.record(z.string().min(1), SavedReadSchema),
    }),
  ),
})

export type SavedReadsFile = z.infer<typeof SavedReadsFileSchema>
