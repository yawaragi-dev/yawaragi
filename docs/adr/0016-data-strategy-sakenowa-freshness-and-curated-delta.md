# ADR-0016: Data strategy — Sakenowa freshness + curated EU/US delta (not a pivot)

## Status

Accepted (2026-07-08). Supersedes the "Sakenowa dump is frozen at 2024" framing in ADR-0014 and issue #129.

Driven by the research artifact [`docs/research/sakenowa-data-strategy.md`](../research/sakenowa-data-strategy.md) ("Shipping Yawaragi: Is the Sakenowa Data Limitation Real, and What Should You Do?").

## Context

We had been operating on the belief that the Sakenowa Data API was frozen at 2024-03-21, which implied a possible data-source pivot before launch. The research disproves the premise:

- **Sakenowa is live and maintained into mid-2026.** `/rankings` returns `yearMonth: 202606`; `/brands` IDs climb to ~121,331; the operator (Aiiro Systems Inc.) shipped a feature update on 2026-06-28. Terms are permissive (free, commercial use allowed, attribution-only — already implemented). No API key, no paid data tier published.
- **Reconciling ADR-0014's evidence (this matters — don't hand-wave it).** ADR-0014 (2026-06-13) recorded `Last-Modified: 2024-03-21` on the exact dump we ingest (`muro.sakenowa.com/sakenowa-data/api`), plus UMAMI absent — real observations then. **Re-verified 2026-07-08:** the same endpoint now returns `Last-Modified: Wed, 08 Jul 2026 18:33:18 GMT`, 3,253 brands, maxId 121,331. So the dump *is* being regenerated again (Sakenowa resumed it, or the 2026-06-13 read hit a stale CDN cache) — the "frozen" premise no longer holds. Practical consequence: our staleness was a one-time 2024 pull that was never refreshed, so the re-sync slice must actually re-pull the live dump on a schedule (see #201), not trust a snapshot. The dump still carries only ~3,253 brands with charts sparser still (~1,500) — that coverage gap is the real problem, addressed below.
- **The real gap is flavor-chart coverage, not staleness.** Sakenowa's 6-axis FlavorProfile is NLP-derived from thousands of Japanese user check-ins per brand, so it only exists for brands with enough check-ins (~1,500–1,600 of an estimated ~3,500–4,000). The base `/brands` + `/breweries` tables are current; the *flavor asset* is sparse for new/newly-imported bottles. Our symptom — "recognised but no flavour chart / no match" — is (a) a stale one-time 2024 cache and (b) matching against the sparse `/flavor-charts`.
- **No authoritative product-level API replaces Sakenowa.** JSS/NRIB publish brewery/award/process data (not a product API); Sakenote's API is closed; Sakenomy has no public API (and is a competitor). The realistic *supplements* are live Sakenowa re-sync, importer/retailer catalogs (Tengu Sake UK, Tippsy/Palate Project US), and Rakuten's Ichiba Item Search API for current listings.
- **The import-relevant universe is small.** Of ~20,000 Japanese sake products, the set actually on EU/US shelves is a low-hundreds-of-SKUs/year target — maintainable by one person.

The 6-axis FlavorProfile is the one asset we cannot fully reproduce. It can be *approximated* from official specs (SMV + total acidity → the classic 甘辛度/濃淡度 quadrant; grade/polishing/rice/yeast → aromatic intensity), but only if labelled as an **estimate distinct from** Sakenowa's review-derived chart.

## Decision

**No pivot.** Keep Sakenowa as the base and close the freshness + coverage gap with engineering hygiene, honest UX, and a small curated delta. Concretely:

1. **Live re-sync (immediate).** Re-pull `/brands`, `/breweries`, `/flavor-charts`, `/brand-flavor-tags` from the live API and schedule a **monthly** re-sync; stop treating the local mirror as a frozen 2024 dump. Attribution is already implemented (keep it).
2. **Honest coverage UX (immediate).** When a brand is recognised but has no FlavorProfile, render a graceful **"recognised — flavour profile coming soon"** state instead of a hard "no match." Non-promotional / discovery-framed (JMStV).
3. **Curated EU/US delta (core, weeks-scale).** A small maintainer-curated table of imported SKUs, seeded from Tengu Sake (UK) + Tippsy/Palate Project (US) + Rakuten Ichiba Item Search API. Every field carries **per-field provenance** (source URL + publisher + fetch date); LLM-assisted extraction with a **human-review** step; unverified fields flagged until confirmed. `source: manual_curation` for confirmed facts.
4. **Estimated FlavorProfile (permitted, deferred to its own slice).** Spec-derived coarse vectors are allowed but MUST be a distinct provenance (planned new source `spec_estimated`) and **visually distinct** from the review-derived FlavorProfile — never presented as equivalent. Not part of the immediate ship; needs formula validation + a design decision first.
5. **Partnerships in parallel (non-blocking).** Email support@sakenowa.com re: update cadence + a possible fuller/fresher feed (note attribution is live); separately sound out one importer (Tengu/Tippsy) for a data/affiliate tie-up.
6. **Positioning.** Lead with **education + flavour-decoding of the ~1,500 well-profiled classics** (EU-first, premium/sommelier framing); frame new-import scanning as "we'll profile it," not a promise of instant full data.

### Provenance & legal discipline

- Facts (brand, brewery, SMV, polishing ratio) are not copyrightable, but respect the EU sui-generis database right + site ToS (Ryanair v PR Aviation): prefer official APIs (Rakuten) and brewery/importer pages, honour robots.txt/ToS, and **never bulk-copy any single proprietary catalog**.
- Non-personal product data is outside GDPR; Rakuten as a new source needs ToS/attribution but no DPA on personal-data grounds — record it in ADR-0009's RoPA if any request metadata is logged.

## Consequences

- **Corrects the record:** the "frozen dump" language in ADR-0014 / README / #129 is retired (ADR-0014 gets a superseded-observation note pointing here). #129 is closed as a disproven premise, folded here.
- **New provenance source** `spec_estimated` will be added to the taxonomy (CONTEXT.md + CLAUDE.md + Zod) **with** the estimated-vector slice, not before.
- **New curated-delta table** must be classified in `src/lib/supabase/db-tables.ts` (public, non-user-scoped) when it lands (ADR-0010).
- **Rakuten** becomes a new external data source (attribution + ToS; non-personal).
- **Thresholds to revisit this ADR:** Sakenowa terms change / API withdrawn → accelerate the delta + partnerships; curated delta > ~1,000 active SKUs or curation > ~1 day/month → pursue a paid importer/Sakenomy deal; telemetry shows users scan mostly *new* bottles (not classics) → prioritise the Rakuten-fed delta + estimated vectors over the historical base.

Implementation is spun out into slices (see #197 for the tracking list).

## Implementation notes (#201 — live re-sync + schedule)

Verified 2026-07-08 while implementing decision item 1:

- **The mirror is already current — the "frozen 2024" premise is empirically dead.** `pnpm sakenowa:freshness` shows the mirror's `source='sakenowa'` rows reach `max(brand_id)=121331` — the exact upstream frontier (a 2024 freeze would cap near ~79k). Brand/brewery counts match upstream within noise. So AC1 ("mirror reflects 2025–2026 brands") was already satisfied by the running cron; no manual production ingest was required.
- **The re-sync is already scheduled — daily, not monthly.** The `/api/cron/ingest` route (`vercel.json` → `0 4 * * *`) pre-dates this ADR and runs a **full ingest daily**. Daily is a strict superset of the ADR's "monthly" minimum. We keep daily deliberately: the pull is free (attribution-only, ~50 KB), idempotent (upsert-only), and strictly fresher than monthly. Downgrading to monthly would be a freshness *regression* for no benefit, so decision item 1's "monthly" reads as a floor, not a target.
- **The freshness check was hardened, not the data.** `scripts/sakenowa-freshness-check.ts` previously flagged `mirror > upstream` as "stale or partial" — a false positive, because the mirror is upsert-only (never tombstones brands Sakenowa later drops) *and* carries the ADR-0014 manual-curation layer, so it legitimately exceeds upstream. The check now compares only `source='sakenowa'` rows and uses the **ID frontier** (`mirror max(brand_id) < upstream`) as the real "is the mirror behind?" signal. The decision logic is extracted to a pure `assessFreshness()` with unit coverage.
- **No provenance/attribution changes** (AC4): attribution is licence-driven and already implemented; this slice touched only the maintainer health check + docs.
