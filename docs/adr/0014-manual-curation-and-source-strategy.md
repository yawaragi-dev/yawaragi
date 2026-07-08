---
title: ADR-0014 — Manual-curation layer and multi-source data strategy
status: accepted
date: 2026-06-13
---

# ADR-0014: Manual-curation layer and multi-source data strategy

> **Update (2026-07-08 — see [ADR-0016](./0016-data-strategy-sakenowa-freshness-and-curated-delta.md)):** the "not re-generated since 2024-03-21" observation below is **superseded**. Re-verified 2026-07-08 that the same dump (`muro.sakenowa.com/sakenowa-data/api`) returns `Last-Modified: 2026-07-08`, 3,253 brands, maxId 121,331 — it is being regenerated again; the earlier reading was a stale cache or a since-resumed pipeline. The real gap is sparse 6-axis flavor-chart coverage, not a frozen dump. The manual-curation layer this ADR introduced remains valid and is retained.

## Context

`muro.sakenowa.com/sakenowa-data/api/brands` is our primary catalogue source — the only free, openly-licensed, structured 6-axis perceptual flavor vector at scale (per ADR-0005 the canonical `source: 'sakenowa'`). However, on 2026-06-13 we confirmed via the `Last-Modified` header that the public Data API dump **has not been re-generated since 2024-03-21** (~26 months stale at the time of writing). Every brand / brewery added to Sakenowa's live system since that date is invisible to our scan flow.

Examples we've hit:
- **UMAMI** — collaboration product by 川鶴酒造 × 柴田屋酒店, present at `https://sakenowa.com/en/brand/4RhvfkA` but absent from the JSON dump.
- The live site has migrated to opaque slug IDs (`4RhvfkA`) while our mirror uses integer IDs (max ~79k). The two ID spaces are non-interconvertible.

A separate deep dive (~3,000-word survey) of alternative sources concluded:
- Sakenowa's 6-axis is irreplaceable at scale (proprietary alternatives like Sakenomy require commercial conversations; open alternatives like Sakepedia carry only chemistry metrics, not perceptual vectors).
- The taste model itself (the f1–f6 vectors and tags) is perfectly valid for the ~3,000 brands the dump does cover; **flavor profiles for established brands don't change**. The staleness is a *coverage* problem, not a *correctness* problem.
- The right move is **don't switch the taste engine; add a thin maintainer-curated layer for the long tail of new brands**.

Sakenowa's `robots.txt` explicitly disallows AI-training bots and sets `ai-train=no`. Honoring that means: do not scrape the live SPA, do not feed scraped Sakenowa content into model training, do not attempt to reverse the internal slug API. Using the multimodal LLM to read a physical bottle label the user photographs is our own data acquisition and does not implicate the robots.txt at all.

## Decision

### 1. Sakenowa stays canonical

We continue to ingest from the public Data API. When (if) Sakenowa refreshes the dump or publishes a streaming API, that becomes our primary path — manual rows step aside.

### 2. Manual-curation layer in the existing `brands` / `breweries` tables

A new manual row uses `source = 'manual_curation'` per ADR-0005's existing provenance taxonomy. No new tables.

**ID-space partition.** Sakenowa's `brand_id` max is currently ~79k, `brewery_id` max ~1.9k. We reserve `>= 9_000_000` for manual rows — 12× headroom for Sakenowa, 8M of clear space for us. Enforced by `CHECK (… source = 'manual_curation' AND brand_id >= 9_000_000 OR …)` per the migration in `supabase/migrations/0011_manual_curation_layer.sql`. Makes it schema-impossible for ingest to overwrite a manual row by ID collision.

### 3. Refresh-conflict policy — α (Sakenowa wins, with operator confirmation)

When Sakenowa eventually publishes a brand we hand-added, ingest detects the conflict via `(name_kanji, brewery_id)` match on `manual_curation` live rows and:

- **Without `--supersede-confirmed`**: ingest prints a structured diff of every manual row that would be superseded, exits non-zero, refuses to apply the Sakenowa upsert. Operator reviews.
- **With `--supersede-confirmed`**: ingest UPDATEs the matching manual rows to `superseded_at = NOW()` and proceeds with the Sakenowa upsert. The manual row stays in the table for audit but disappears from the public read path.

All public read queries filter `superseded_at IS NULL`.

### 4. Per-record source tracking (not per-field)

ADR-0005 already pins source per record. We keep this. A `brand.source = 'manual_curation'` doesn't distinguish whether `nameRomaji` was hand-typed or LLM-generated; this is acceptable friction for the gain in schema simplicity. Foreign keys (e.g. a manual brand's `brewery_id` pointing to a Sakenowa brewery) do NOT propagate source labels.

### 5. Attribution by rendered-source set

`<SakenowaAttribution />` renders when **any** record actually shown on a page has `source` in `{'sakenowa', 'sakenowa_inferred'}`. Pages collect a `Set<Source>` of rendered records and render attribution components for each source-with-attribution-requirement in that set. Same logic generalises to any future source (NTA, Wikidata, Sakepedia, …) that comes with an attribution clause.

Attribution is licence-driven; it's independent of `<ProvenanceBadge />` (per-record trust signal, ADR-0005).

### 6. Programmatic extensibility

`pnpm add-manual-brand` (`scripts/add-manual-brand.ts`) is the maintainer + automation seam. Exports `addManualBrand(input, pool)` for programmatic use from other ingest scripts — anticipated for future automated gap-fill from officially-published sources (NTA brewery maps + GI list, JSS, Wikidata SPARQL, possibly Sakepedia under CC-BY).

## Source taxonomy reference

| `source` value      | Required attribution? | Render `<ProvenanceBadge />`? | Used for                          |
|---------------------|-----------------------|-------------------------------|-----------------------------------|
| `sakenowa`          | **Yes**               | No                            | Sakenowa Data API ingest          |
| `sakenowa_inferred` | **Yes**               | No                            | Deterministic math over Sakenowa  |
| `manual_curation`   | No                    | No                            | Hand-curated extension (this ADR) |
| `llm_extracted`     | No                    | **Yes**                       | LLM read off a label              |
| `llm_inferred`      | No                    | **Yes**                       | LLM reasoning over Sakenowa data  |
| `cross_beverage_map`| No                    | **Yes**                       | Hand-curated cross-beverage table |
| `user_corrected`    | No                    | No                            | Visitor override (future)         |

## What this ADR does not commit to

- **Sakenomy partner/licensing conversation.** Stage 3 in the deep-dive's roadmap. Out of scope until eval / launch evidence demands current-brand coverage at scale.
- **NTA brewery maps ingestion.** PDF parsing per prefecture. Out of scope until we hit a concrete brewery-entity-resolution problem.
- **Wikidata cross-linking.** Useful for brewery disambiguation; deferred.
- **Sakepedia CC-BY supplementary ingest.** Useful for chemistry metrics (日本酒度, 酸度, 精米歩合); deferred.

## Consequences

- We can hand-add a small number (low dozens) of post-2024-03 bottles via `pnpm add-manual-brand` immediately. UMAMI is case zero.
- The schema is forward-compatible with eventual Sakenowa refresh — ingest detects + asks for confirmation rather than silently overwriting our work.
- Attribution remains clean (no Sakenowa attribution on manual-only sake pages; Sakenowa attribution whenever the brewery info is rendered from Sakenowa).
- Future programmatic ingest scripts have a stable `addManualBrand()` entry point.

## References

- ADR-0005 (provenance taxonomy)
- `docs/label-scan-recognition-obstacles.md` §22 (script-coverage gaps + corrected staleness diagnosis)
- `supabase/migrations/0011_manual_curation_layer.sql`
- `scripts/add-manual-brand.ts`
