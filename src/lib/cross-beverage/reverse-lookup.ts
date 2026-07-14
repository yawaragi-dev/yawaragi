import type { CrossBeverageMap, Exemplar } from '@/lib/schemas/cross-beverage-map'
import { CROSS_BEVERAGE_MAP } from '@/lib/ai/tools/cross-beverage-data'
import { flavorDistance, type FlavorAxes } from '@/lib/flavor/flavor-similarity'

/**
 * Reverse cross-beverage lookup (UX-C, issue #164). Given a sake's 6-axis
 * `FlavorProfile`, find the nearest hand-curated cross-beverage descriptor(s)
 * from `CROSS_BEVERAGE_MAP` — so the scan result card can name a familiar
 * Western reference for the matched sake ("Interesting for those who like
 * Lagavulin 16").
 *
 * Design notes (from issue #164):
 *
 *   1. **Direction is reversed, seam is fresh.** The forward direction
 *      (`mapCrossBeverage`, `src/lib/ai/tools/map-cross-beverage.ts`) is a
 *      pure descriptor → row lookup consumed by the LLM tool loop. Reverse
 *      is a pure math function consumed by the RSC that renders the scan
 *      result card. Do NOT thread reverse through the AI SDK tool
 *      interface — that would give the LLM a way to invent new mappings by
 *      picking a sake vector at will. Reverse is a deterministic UI hook,
 *      not a tool.
 *
 *   2. **L2 Euclidean distance over the 6 axes** — via the shared
 *      `flavorDistance` in `@/lib/flavor/flavor-similarity` (which documents
 *      why L2 over cosine, and where the one cosine path deliberately lives).
 *      Weighted distance was considered and rejected here: no axis is
 *      privileged in the research doc's calibration section, and a weight
 *      vector adds a tuning parameter the reverse hook does not need.
 *
 *   3. **Honesty threshold.** Below the threshold the reverse hook must
 *      render an explicit "distinctly Japanese profile — no close Western
 *      analog" line rather than a forced match. The threshold value below
 *      was chosen by inspection against the research doc's own limitations
 *      section — see the constant's JSDoc.
 *
 *   4. **Provenance stays `cross_beverage_map`.** The row returned by the
 *      lookup carries its schema-pinned provenance envelope; the UI
 *      renders `<HeuristicDisclaimer />` + `<ProvenanceBadge />` next to
 *      the exemplar name (CLAUDE.md § "Cross-beverage disclaimers").
 *
 *   5. **The LLM stays out.** Exemplar names come from the hand-curated
 *      `EXEMPLARS_BY_DESCRIPTOR` map in `cross-beverage-data.ts`. The LLM
 *      is forbidden from inventing new exemplars.
 */

/**
 * Honesty threshold: reverse matches with L2 distance > this value are
 * treated as "no close Western analog" rather than surfaced as an
 * exemplar. The scan card renders the localized "distinctly Japanese
 * profile" line in that branch instead of a forced match.
 *
 * Tuning process
 * --------------
 * Chosen by inspection against the 6-axis distances between neighbouring
 * research-doc rows. Sample distances against the peated (Yamahai) anchor
 * `[f1=0.11, f2=0.80, f3=0.75, f4=0.22, f5=0.70, f6=0.15]`, measured
 * against the shipped `CROSS_BEVERAGE_MAP` rows on 2026-07-07:
 *
 *   - `smoky` (Talisker anchor, sibling of peated) — L2 ≈ 0.078. Should
 *     match: same peated cluster.
 *   - `full-bodied` (Napa Cab anchor) — L2 ≈ 0.111. Should match: same
 *     dense-savory family.
 *   - `oxidative` (Fino/Oloroso mean) — L2 ≈ 0.175. Should match:
 *     overlapping umami depth, adjacent aromatic pole.
 *   - `sherry-cask-floral` (Macallan) — L2 ≈ 0.823. Should NOT match:
 *     opposite aromatic pole (bright/floral vs earthy/peat).
 *   - `pilsner-clean` (German Pilsner) — L2 ≈ 1.115. Should NOT match:
 *     opposite everything (light/dry/crisp vs heavy/umami/oxidative).
 *   - A mid-value profile [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] — L2 ≈ 0.67
 *     to the nearest anchor. Should NOT match: a delicate Junmai
 *     Daiginjo has no genuine Western analog.
 *
 * `0.55` sits in the visible gap between the "same family / adjacent
 * cluster" band (0.08–0.18) and the "different family entirely" band
 * (0.67+ to any anchor from a mid-value profile, 0.8+ across families).
 * Above 0.55 the analog quality degrades quickly — a delicate Junmai
 * Daiginjo is not really "like" a Manzanilla sherry even if the numbers
 * still round the same way — so the threshold is deliberately
 * conservative rather than trying to force every sake to have an
 * analog. Delicate ginjos legitimately have no Western equivalent
 * (issue #164 acceptance criterion).
 *
 * The threshold is subjective, and a follow-up PR can retune it against
 * the actual empirical distribution of Sakenowa flavor charts once we
 * have shipped scans in production. The important shape is that (a) it
 * is a constant, not a per-descriptor override; (b) below-threshold
 * matches produce a graceful "no analog" state, not an error; (c) the
 * math is symmetric and deterministic so a regression is unit-catchable.
 */
export const REVERSE_MATCH_THRESHOLD = 0.55

/**
 * A single reverse-match hit — the exemplar to name, plus the descriptor
 * + distance for the UI (or a debug panel) to inspect. The descriptor is
 * carried so the UI could later render a "styled like a [smoky whisky]"
 * secondary line without another round-trip to the row.
 */
export interface ReverseExemplarHit {
  readonly exemplar: Exemplar
  readonly descriptor: string
  readonly distance: number
}

/**
 * The result shape. Discriminated on `kind` so the RSC caller can
 * pattern-match without inspecting an ambiguous empty array.
 *
 * `kind: 'match'` — one or two exemplars within threshold.
 * `kind: 'no-close-analog'` — nothing within threshold; the UI renders
 * the "distinctly Japanese profile" line.
 */
export type ReverseExemplarResult =
  | { readonly kind: 'match'; readonly hits: readonly ReverseExemplarHit[] }
  | { readonly kind: 'no-close-analog' }

interface FindOptions {
  /**
   * Override the default match threshold. Kept optional for tests; the
   * default of `REVERSE_MATCH_THRESHOLD` is the shipped value.
   */
  readonly threshold?: number
  /**
   * Override the descriptor table. Optional for tests — the default is
   * the shipped `CROSS_BEVERAGE_MAP`.
   */
  readonly rows?: readonly CrossBeverageMap[]
  /**
   * Maximum number of hits to return above threshold. Defaults to 2 per
   * the issue's "top 1–2" acceptance criterion.
   */
  readonly maxHits?: number
}

/**
 * Find the nearest cross-beverage exemplars for a given sake flavor
 * profile.
 *
 * Iterates the full descriptor table (62 rows today), computes the L2
 * distance to each row's 6-axis vector, ranks by distance ascending, and
 * returns the top 1–2 hits within `threshold` OR the `no-close-analog`
 * sentinel below it. Deterministic — no randomness, no cache — so a unit
 * test can pin the top hit for a fixture profile.
 *
 * For each descriptor hit, the FIRST exemplar in the row's exemplar list
 * is surfaced. The research doc lists the primary anchor first (e.g.
 * `peated` → Lagavulin 16 before Ardbeg 10) so the surfaced name matches
 * the descriptor's canonical example. A future PR could round-robin
 * across a descriptor's exemplars, but the simple "first" rule keeps the
 * result deterministic.
 */
export function findNearestExemplars(
  profile: FlavorAxes,
  options: FindOptions = {},
): ReverseExemplarResult {
  const threshold = options.threshold ?? REVERSE_MATCH_THRESHOLD
  const rows = options.rows ?? CROSS_BEVERAGE_MAP
  const maxHits = options.maxHits ?? 2

  const ranked = rows
    .map((row) => ({
      row,
      distance: flavorDistance(profile, row),
    }))
    .filter(({ distance }) => distance <= threshold)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxHits)

  if (ranked.length === 0) {
    return { kind: 'no-close-analog' }
  }

  const hits: readonly ReverseExemplarHit[] = ranked.map(({ row, distance }) => ({
    // The schema requires at least one exemplar per row, so `[0]` is safe;
    // the non-null assertion is documenting that invariant.
    exemplar: row.exemplars[0]!,
    descriptor: row.descriptor,
    distance,
  }))

  // De-dupe by exemplar name. Two descriptors can share their primary
  // anchor (e.g. `peated` and `smoky` both list Lagavulin 16 first) — in
  // that case the second hit is not additional information for the
  // visitor. This favours the closer descriptor and drops the duplicate.
  const seen = new Set<string>()
  const deduped: ReverseExemplarHit[] = []
  for (const hit of hits) {
    if (seen.has(hit.exemplar.name)) continue
    seen.add(hit.exemplar.name)
    deduped.push(hit)
  }

  return { kind: 'match', hits: deduped }
}
