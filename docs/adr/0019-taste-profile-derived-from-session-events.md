---
title: ADR-0019 — Taste Profile v1 is derived from session-scoped TasteEvents, not a stored per-user vector
status: accepted
date: 2026-07-13
---

# ADR-0019: Taste Profile v1 is derived from session-scoped TasteEvents, not a stored per-user vector

## Context

Phase 5's flagship is the [TasteProfile](../../CONTEXT.md#language) — a User's six-axis preference the recommender ranks against. The obvious implementation, and the one the Phase 5 PRD body (#220) originally sketched, is a `user_taste_vectors` table: one Clerk-linked row per user holding the running vector, mutated in place on each interaction.

Two forces push against that shape for v1:

1. **The `user_id` table triggers the Supabase Pro gate.** Per [ADR-0011](./0011-per-env-data-isolation.md), the first PR adding a table with a Clerk-linked `user_id` requires the Supabase Pro + Branches upgrade to land first (prod/preview data isolation). That is real money and a dashboard step we chose to defer.
2. **GDPR weight.** A stored per-user vector is account-linked personal data with erasure/export/portability obligations that must be implemented and tested before the DACH launch (ADR-0009). Building all of that is disproportionate to a v1 that just needs to *feel* personalised.

A design insight makes the choice cheap: incremental EMA over a running vector and replaying the raw interaction events with the same weighting produce **identical numbers** — EMA is a fold. So "store the vector" versus "store the events and derive the vector" is a storage/erasure/reproducibility decision, not a math decision. The CONTEXT.md glossary had *already* defined the TasteProfile as "derived, not stored as a snapshot" — the stored-vector approach silently contradicted it.

## Decision

**v1 stores a bounded list of [TasteEvents](../../CONTEXT.md#language) keyed by the anonymous session (the existing `yawaragi_session` identifier, same infrastructure as the rate limiter), and derives the six-axis TasteProfile by a pure fold over those events on read. There is no `user_taste_vectors` table and no Clerk account requirement in v1.**

- A **TasteEvent** is a dated rating / scan-accept / cross-beverage seed carrying a signed strength (see CONTEXT.md).
- `deriveTasteProfile(events, now)` is a pure function: neutral-0.5 prior, replay oldest→newest applying `v += wEff·(target − v)` per axis with per-step clamp to [0,1], where `wEff = weight · 0.5^(ageDays / TASTE_EVENT_HALF_LIFE_DAYS)`. Weights: rating `(r−3)/5`, scan-accept `+0.3`, cross-beverage seed `+0.5`. No separate learning rate; recency is intrinsic to replay order, with the half-life knob adding wall-clock fade.
- Erasure = drop the session key. Retention = session TTL. Lawful basis = `consent` (personalisation). The vector is pseudonymous, not Art. 9 data.

## Considered options

- **Stored per-user vector (`user_taste_vectors` + RLS).** The PRD's original shape. Rejected for v1: triggers the ADR-0011 Pro gate and the full account-linked GDPR surface, for a personalisation property we can deliver without either. This is the **target for the later account-persistence slice**, once Pro lands.
- **Stored per-session vector (mutated in place).** Avoids the Pro gate but throws the inputs away — no provenance-per-input ("which events shaped this axis?", a PRD requirement), contradicts the "derived, not stored" glossary entry, and is order-dependent state that can't be recomputed. Rejected.
- **Derive from stored session events (chosen).** Keeps the glossary true, makes erasure trivial (drop one key), keeps provenance answerable, and makes the fold a pure, heavily-testable function.

## Consequences

- **No cross-device / cross-browser persistence in v1.** A TasteProfile lives with the anonymous session; clearing cookies or switching devices starts fresh. This is the deliberate cost. Account-linked persistence is a follow-up slice gated on the Supabase Pro upgrade, at which point events (or the derived vector) migrate to a `user_id`-scoped table — and #219's RLS test seam, already merged, is waiting for it.
- **ADR-0011 Step 2 does not fire.** v1 adds no `user_id` table, so the merge gate is satisfied without amendment; Pro is still due before launch for PITR (PRE-GO-LIVE §7.7), just not now.
- **RoPA gains a session-scoped TasteEvents row, not an account row** (ADR-0009).
- **The derived vector depends on `now`** (time-decay), so it is a function of (events, reference time). Deterministic given a fixed `now`; the pure fold takes `now` as an argument and the action layer supplies the clock.
- A rating/scan on a Sake with **no FlavorProfile** (sparse coverage, [ADR-0016](./0016-data-strategy-sakenowa-freshness-and-curated-delta.md)) yields no placeable target and therefore no TasteEvent.

## References

- [#220](https://github.com/yawaragi-dev/yawaragi/issues/220) — Phase 5 PRD (body describes the eventual account-persistence target; the v1 decision comment records this pivot).
- [ADR-0011](./0011-per-env-data-isolation.md) — the Pro+Branches gate this defers.
- [ADR-0009](./0009-gdpr-compliance-posture.md) — GDPR posture / RoPA.
- [ADR-0016](./0016-data-strategy-sakenowa-freshness-and-curated-delta.md) — sparse flavor-chart coverage.
- CONTEXT.md — **TasteProfile**, **TasteEvent** glossary entries.
