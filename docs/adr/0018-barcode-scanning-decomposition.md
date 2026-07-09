# Barcode scanning: decompose into a curated-data rider + a metric-gated scanner

**Status:** accepted (2026-07-09). Driven by the research artifact [`docs/research/barcode-scanning-feasibility.md`](../research/barcode-scanning-feasibility.md). Relates to [ADR-0016](./0016-data-strategy-sakenowa-freshness-and-curated-delta.md) (data strategy), #203 (curated EU/US delta), and #214 (the deferred scanner).

## Context

The question raised: should Yawaragi add barcode scanning as a bottle-identification path, and how should it be prioritised? A feasibility survey (linked above) concluded:

- Barcode **numbers** scan reliably on Japanese-market bottles, but **resolving a number to a trustworthy product record** is where it fails — there is no authoritative sake barcode database, coverage is thinnest for exactly the premium/craft/limited SKUs enthusiasts scan, and EU-importer relabeling replaces the Japanese JAN with a new EAN no Japanese source can resolve.
- Estimated (unmeasured) resolve rate for EU-purchased sake is **20–45%**, versus label-photo which always extracts *something* usable.
- Every runtime resolver (Yahoo! Shopping JP, UPCitemdb, Open Food Facts) is a **new third-party — and non-EU — vendor**, which under this project's GDPR posture (CLAUDE.md vendor rule) is a DPA/SCC gate, for low, speculative payoff. OFF additionally carries ODbL share-alike risk if merged into a published dataset.
- Client scanning needs a **mandatory iOS Safari WASM fallback** (iOS `BarcodeDetector` is broken, WebKit #281848) — real cost.
- The one place barcode is authoritative and delightful is a **maintainer-curated JAN/importer-EAN table** for the EU/US SKUs actually on DACH shelves — no third-party dependency, no UGC.

The research's own recommendation ("(c) curated table as backbone + (b) disambiguation aid + label-photo primary") is sound but still frames barcode as a feature. The sharper observation for *this* codebase: (c) is not a barcode feature at all — it is two columns on the curated-delta table already scoped in #203 — and its user payoff still depends on building the scanner (b). So the cost/value profile splits cleanly into three very different things that should not be committed to as one.

## Decision

**Do not prioritise "barcode scanning" as a feature initiative. Decompose it, commit only to the cheap authoritative piece now, and gate the rest behind a metric.**

1. **Buy the data option now (cheap, authoritative).** Add nullable `jan_code` + `importer_ean` columns (with the same per-field provenance as every other field) to the **#203** curated-delta table, and add "record JAN + importer EAN" to the curation checklist. Recording codes at curation time is nearly free; back-filling later is not. This is the whole barcode commitment for the current horizon and it needs no scanner and no third-party vendor.
2. **Gate the client scanner (real cost, speculative payoff) behind a trigger.** The `BarcodeDetector` + iOS-WASM fallback + disambiguation UI + exact-match-against-curated-codes work is tracked in **#214** and stays deferred until a trigger fires (see below). Label-photo remains the primary identifier.
3. **Deprioritise runtime third-party barcode lookups hard.** Yahoo/UPCitemdb/OFF each require vendor onboarding (DPA/SCC) for low payoff; prefer expanding the curated table over onboarding any of them. Only revisit if the scanner is built *and* curated coverage is insufficient *and* the vendor clears the GDPR gate.

### Triggers that promote #214 from deferred to build (any one)

- **Ambiguity metric (measurable now, no barcode code):** instrument the existing label pipeline — if a materially large share of scans return multiple candidates where a tie-breaker would help, the disambiguation role earns its keep.
- **Curated coverage:** once #203's delta covers most real user scans, barcode-first-for-known-SKUs becomes a worthwhile fast path.
- **Post-scanner resolve rate:** if shipped behind a flag and instrumentation shows **>70%** of real scans resolve, promote from disambiguation to co-primary.
- **External:** iOS Safari restores `BarcodeDetector` (drops the WASM tax), or a queryable authoritative sake barcode source appears (GS1 Japan opening JICFS/GJDB affordably; an importer publishing a barcode API).

## Consequences

- Barcode gets **no standalone roadmap slot**. It makes #203 marginally richer (two columns + a checklist line) and leaves a well-specified, metric-gated option (#214) for later — keeping it off the Phase-5 / data-strategy / launch-DPA critical path.
- Label-photo scanning stays the universal entry point (the only method that degrades gracefully and handles relabeled/uncoded/long-tail bottles), matching Vivino/Sakenomy.
- The curated JAN/EAN columns are an option **bought now, exercised later**: cheap data captured at curation time, whose user-facing value is unlocked only when #214's trigger fires and the scanner ships.
- A future contributor proposing "add barcode scanning" should read this ADR first: the feature was evaluated and deliberately decomposed; the actionable part is already folded into #203, and the rest is intentionally gated in #214, not forgotten.
