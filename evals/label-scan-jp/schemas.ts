import { z } from 'zod'

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
export const GroundTruthEntrySchema = z
  .object({
    name_ja: z.string().min(1),
    brewery_ja: z.string().min(1),
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
  })

export type GroundTruthEntry = z.infer<typeof GroundTruthEntrySchema>

/**
 * The whole ground-truth file: a map from photo filename (as it appears in
 * `photos/` or `fixtures/`) to its ground-truth entry. Keyed by filename so a
 * maintainer adding a photo edits exactly one obvious place, and so the
 * runner can pair each file on disk with its expected answer by name.
 */
export const GroundTruthFileSchema = z.record(z.string().min(1), GroundTruthEntrySchema)

export type GroundTruthFile = z.infer<typeof GroundTruthFileSchema>
