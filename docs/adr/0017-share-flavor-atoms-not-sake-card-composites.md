# Share sake-display *atoms*, not card *composites*

**Status:** accepted (2026-07-09). Records a deliberate deferral from the #198 pre-Phase-5 architecture pass; supersedes the "extract a shared `SakeResultCard` / `SakeIdentity`" candidate raised in that pass.

## Context

Three surfaces render "a recognised Sake" as a card:

- the Sake detail page (`src/app/[locale]/sake/[brandId]/page.tsx`),
- the scan result card (`src/components/scan/scan-result-card.tsx`),
- the suggest result card (`SuggestCard` in `src/app/[locale]/suggest/suggest-results.tsx`).

The #198 architecture pass flagged these as duplicated composites and proposed a shared `SakeResultCard` (or at least a shared `SakeIdentity` header block). The Taste Profile builder (Phase 5) will render a fourth sake card ("interesting for those who like Riesling", similar-sake lists), which sharpened the question: consolidate the composite before adding the fourth, or not?

On inspection the three cards share a *visual rhyme* (kanji name + romaji + a provenance element, optionally a brewery line and a flavor chart) but diverge on nearly every structural axis:

| axis | detail page | scan card | suggest card |
|------|-------------|-----------|--------------|
| name element | `<h1>` (semantic heading) | `<span>` (3xl) | `<Link>` (lg) |
| provenance on name | `ProvenanceBadge` on romaji (`llm_inferred`) | `llm_extracted` badge on the **kanji** (scan confidence) | none (badge is on the `reason`) |
| trailing element | — | — | inline `SakenowaAttribution` |
| brewery | full labelled section (+ romaji + badge) | inline one-line label | absent |
| body | prefecture, rankings, full row chart, "find similar" | photo, reverse-exemplar hook, "flavor coming soon", rescan | LLM reason, cross-beverage descriptor, flavor cluster |
| testids | `brand-*` | `scan-result-*` | `suggest-card-*` |

## Decision

**Do not extract a shared sake-card composite (`SakeResultCard` / `SakeIdentity`). Keep each surface's card its own module, and share at the *atom* layer instead.**

The shared seam that pays off is the set of small, deep display atoms every card composes:

- `FlavorProfileView` / `FlavorRadarView` (six-axis rendering — consolidated in #198),
- `ProvenanceBadge(View)`, `HeuristicDisclaimer(View)`, `FlavorAxisLabel(View)`, `SakenowaAttribution(View)`.

Phase 5's taste-profile card composes those same atoms; it does **not** need a shared composite.

## Rationale (the deletion test)

A shared `SakeIdentity` would need an interface carrying: the name element kind (`h1` / `span` / `Link`) + optional `href`, which field (if any) gets which provenance badge, an optional trailing slot, an optional brewery slot, per-part `className` overrides, and a testid prefix — roughly 8–9 interface facts to render ~6 lines of JSX per site. That is a **shallow** module by the project's architecture vocabulary (`.claude/skills/improve-codebase-architecture/LANGUAGE.md`): the interface is nearly as complex as the implementation.

Applying the deletion test: deleting such a component would **move** complexity back to the call sites, not **concentrate** it, because each surface already supplies all of its own variation — the variation *is* the content, and there is almost no shared *behaviour*, only shared *shape*. That is the "one adapter = a hypothetical seam" situation: the surfaces only look alike; they do not vary across a common seam.

Contrast the extractions that *were* done in #198 (the FlavorProfile primitive and `FlavorProfileView`): those hide real behaviour (the `[0,1]` range invariant; the `role="progressbar"` a11y contract, value formatting, axis iteration, and i18n-key resolution) behind a small interface — deep, and they earn their keep across ≥3 callers.

## Consequences

- Each sake card stays independently editable — a scan-card UX change (photo, reverse hook) cannot regress the detail page or a suggest card, and vice-versa. Divergence here is a feature, not debt.
- The atoms remain the enforced consistency layer: the "never English-only" flavor-axis rule, per-source provenance chrome (ADR-0005), and Sakenowa attribution (ADR-0014) live in the atoms, so all four cards inherit them without a shared composite.
- **Phase 5** builds its taste-profile card as its own module composing the shared atoms — this is the expected shape, not a fourth instance of avoidable duplication.
- A future architecture pass (or Explore agent) that re-proposes "unify the sake cards" should read this ADR first: the composite was considered and deliberately rejected as a shallow abstraction. Re-open only if the surfaces *converge* structurally (e.g. the badge-placement and name-element rules stop differing), which would turn the hypothetical seam into a real one.
- Genuinely local duplication *within* a single surface (e.g. the detail page repeats "romaji field → `llm_inferred` badge" for brand and brewery) may still be tidied per-file; that is not what this ADR defers.

Recorded as part of #198. Companion to the shipped #198 slices: the FlavorProfile primitive and the shared `FlavorProfileView`.
