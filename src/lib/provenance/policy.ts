import type { ProvenanceSource } from '@/lib/schemas/with-provenance'

/**
 * Pure predicates over the 7-value `ProvenanceSource` taxonomy
 * (CLAUDE.md "Source provenance", ADR-0005).
 *
 * Why lookup tables (`satisfies Record<ProvenanceSource, boolean>`) over
 * switch/default: adding an 8th source to the enum must surface as a
 * TypeScript error in every predicate, not get silently bucketed by a
 * `default:` branch. The `satisfies` clause is the enforcement.
 *
 * No `import 'server-only'` — these predicates are safe in any layer
 * (server components, client components, edge, test). The badge
 * component, ingestion pipeline, and chat tools all consume them.
 */

const RENDER_BADGE: Record<ProvenanceSource, boolean> = {
  sakenowa: false,
  sakenowa_inferred: false,
  llm_extracted: true,
  llm_inferred: true,
  cross_beverage_map: true,
  user_corrected: false,
  manual_curation: false,
} satisfies Record<ProvenanceSource, boolean>

/**
 * ADR-0005 attaches a SECOND rendering obligation to `cross_beverage_map`:
 * on top of the provenance badge, any surface displaying a
 * cross-beverage-mapped value must also render `<HeuristicDisclaimer />`
 * (CLAUDE.md § "Cross-beverage disclaimers"). It is the only source that
 * carries the "these are approximations" caveat, because its failure mode
 * is "the hand-curated mapping is wrong" rather than "an LLM hallucinated".
 *
 * Keeping this as a `satisfies Record<ProvenanceSource, boolean>` table
 * next to `RENDER_BADGE` makes "what chrome does source X require" a single
 * lookup per obligation — before this, the disclaimer rule lived only as
 * convention inside two JSX trees keyed off different data triggers, with
 * nothing enforcing it (#198).
 */
const RENDER_HEURISTIC_DISCLAIMER: Record<ProvenanceSource, boolean> = {
  sakenowa: false,
  sakenowa_inferred: false,
  llm_extracted: false,
  llm_inferred: false,
  cross_beverage_map: true,
  user_corrected: false,
  manual_curation: false,
} satisfies Record<ProvenanceSource, boolean>

/**
 * The three badge presentation kinds. Doubles as the i18n message subkey
 * (`provenance.badge.${kind}`) and the per-kind style/`data-kind` key in
 * `<ProvenanceBadge />`. Lives here (not in the badge component) so the
 * `source → kind` mapping is single-sourced and reachable from both the
 * async server wrapper AND `'use client'` callers.
 */
export type BadgeKind = 'llmExtracted' | 'llmInferred' | 'crossBeverageMap'

/**
 * Total `source → badge kind` map. `null` for the four canonical sources
 * (no badge). `satisfies Record<ProvenanceSource, BadgeKind | null>` keeps
 * the same "an 8th source must be classified or it's a compile error"
 * discipline as `RENDER_BADGE`; the non-null entries agree with
 * `RENDER_BADGE` by construction (pinned by the policy test).
 */
const SOURCE_TO_KIND = {
  sakenowa: null,
  sakenowa_inferred: null,
  llm_extracted: 'llmExtracted',
  llm_inferred: 'llmInferred',
  cross_beverage_map: 'crossBeverageMap',
  user_corrected: null,
  manual_curation: null,
} satisfies Record<ProvenanceSource, BadgeKind | null>

const LLM_SOURCED: Record<ProvenanceSource, boolean> = {
  sakenowa: false,
  sakenowa_inferred: false,
  llm_extracted: true,
  llm_inferred: true,
  cross_beverage_map: false,
  user_corrected: false,
  manual_curation: false,
} satisfies Record<ProvenanceSource, boolean>

/**
 * `true` for sources whose values need a visible provenance badge so the
 * user can tell at a glance the value was not fetched verbatim from a
 * canonical reference (Sakenowa, manual curation, or their own
 * correction). The three "needs a badge" sources are `llm_extracted`,
 * `llm_inferred`, and `cross_beverage_map`.
 */
export function shouldRenderBadge(source: ProvenanceSource): boolean {
  return RENDER_BADGE[source]
}

/**
 * `true` for sources that additionally require `<HeuristicDisclaimer />`
 * alongside the badge — currently only `cross_beverage_map`. The single
 * decision point for the ADR-0005 disclaimer obligation, so a future
 * surface can't badge cross-beverage output and silently omit the caveat.
 */
export function shouldRenderHeuristicDisclaimer(source: ProvenanceSource): boolean {
  return RENDER_HEURISTIC_DISCLAIMER[source]
}

/**
 * Pure `source → badge kind` resolver. Returns the presentation kind for a
 * badged source, or `null` for canonical sources (no badge). No i18n, no
 * async, no `server-only` — importable from both the async server wrapper
 * and `'use client'` callers, so the mapping is encoded exactly once.
 *
 * The overloads narrow the return to a non-null `BadgeKind` when the caller
 * passes a known-badged source literal (so client callers that previously
 * hardcoded `kind="llmExtracted"` get the same non-null type without a
 * guard); the general signature returns `BadgeKind | null` for dynamic
 * sources (the server wrapper's case).
 */
export function resolveBadgeKind(source: 'llm_extracted'): 'llmExtracted'
export function resolveBadgeKind(source: 'llm_inferred'): 'llmInferred'
export function resolveBadgeKind(source: 'cross_beverage_map'): 'crossBeverageMap'
export function resolveBadgeKind(source: ProvenanceSource): BadgeKind | null
export function resolveBadgeKind(source: ProvenanceSource): BadgeKind | null {
  return SOURCE_TO_KIND[source]
}

/**
 * Inverse of `shouldRenderBadge`. A canonical source is one whose value
 * does not require a badge: it came from Sakenowa (raw or
 * deterministically derived), from a hand-curated table, or from the
 * user themselves.
 */
export function isCanonical(source: ProvenanceSource): boolean {
  return !RENDER_BADGE[source]
}

/**
 * `true` only for `llm_extracted` and `llm_inferred`. Does NOT include
 * `cross_beverage_map` — the cross-beverage table is hand-curated and
 * deterministic, not LLM output, even though it gets a badge for the
 * "this is an approximation" disclaimer reason.
 */
export function isLLMSourced(source: ProvenanceSource): boolean {
  return LLM_SOURCED[source]
}

/**
 * `true` when a record's source set mixes at least one canonical entry
 * with at least one non-canonical entry. Used to detect "this card
 * shows 4 Sakenowa facts and 1 LLM fact" so the UI can distinguish them
 * (CLAUDE.md: "Never blend sources silently"). Empty arrays and
 * single-source arrays return `false` — there is nothing blended.
 */
export function isBlendedRecord(sources: ProvenanceSource[]): boolean {
  let hasCanonical = false
  let hasNonCanonical = false
  for (const s of sources) {
    if (RENDER_BADGE[s]) hasNonCanonical = true
    else hasCanonical = true
    if (hasCanonical && hasNonCanonical) return true
  }
  return false
}
