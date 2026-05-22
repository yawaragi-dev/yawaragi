# Source provenance on every displayed datum

Every record type in `src/lib/schemas/` carries an explicit `source` enum field (and optionally `confidence: 0..1`). The taxonomy is fixed: `sakenowa`, `sakenowa_inferred`, `llm_extracted`, `llm_inferred`, `cross_beverage_map`, `user_corrected`, `manual_curation`. UI components render a `<ProvenanceBadge />` wherever non-canonical sources (LLM-extracted, LLM-inferred, cross-beverage-mapped) are displayed. Cards never blend sources silently — facts from Sakenowa and facts from an LLM in the same card are visually distinguished. LLM-generated tasting notes always carry an "AI-written" badge and an `improve` / `report` affordance.

We chose this rather than the more common approach (display LLM output undistinguished from authoritative data) because LLM-augmented apps routinely blur model output and ground-truth data, which misleads users, makes hallucinations invisible, and creates ethical and trust problems. Provenance is also the unifying primitive that several otherwise-separate UX requirements collapse into: attribution, hallucination flagging, cross-beverage disclaimers, user corrections, and the dev-mode audit view all derive from the same `source` field — so getting it right once in the schema layer makes everything downstream cheap.

## Consequences

- Phase 2 Zod schemas grow by one or two fields per record type.
- Phase 3 (label scan) persists *both* the raw LLM extraction and the matched Sakenowa brand, with distinct sources, so the user-facing card can show "we read this from the label" alongside "this is what Sakenowa knows".
- Phase 4 (chat) tool result cards carry their source through to the render layer.
- Phase 5 (taste profile) records which rating event came from which source.
- A `/dev/provenance` page shows the share of displayed facts in the last 7 days by source, as an internal audit and an external trust signal.

The cross-beverage map (`source: "cross_beverage_map"`) is the only deterministic-but-heuristic source in the taxonomy. It always renders with `<HeuristicDisclaimer />` rather than `<ProvenanceBadge />` because the failure mode is "the mapping is wrong" rather than "the LLM hallucinated", and the disclaimer copy reflects that.
