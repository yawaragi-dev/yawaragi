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
