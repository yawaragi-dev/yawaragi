---
title: ADR-0020 — Tasting journal is the spine; persistence is auth-gated and maintainer-only, with an interactive-but-ephemeral public example
status: accepted
date: 2026-07-18
supersedes: ADR-0019
---

# ADR-0020: Tasting journal is the spine; persistence is auth-gated and maintainer-only, with an interactive-but-ephemeral public example

## Context

Two threads converged here.

1. **The user-journey research (#237).** Scoping `/profile` (P5-04b, #236) surfaced that the user-journey framing was under-baked. The [feature-design research](../research/journal-ratings-insights-feature-design.md) resolved the model: the **tasting journal is the spine**, and the taste vector, recommender, and insights are all *downstream outputs* of it. Our existing [TasteEvent](../../CONTEXT.md#language) (#231) is the primitive the journal emits; the radar `/profile` view is one of its outputs, not its own surface.

2. **A product-shape decision by the maintainer.** [ADR-0019](./0019-taste-profile-derived-from-session-events.md) shipped Phase 5 with **anonymous, session-scoped taste profiles for everyone** — the interactive `/profile` cold-start (the cross-beverage seed form writing raw [TasteEvents](../../CONTEXT.md#language) to a 24 h-TTL Upstash list keyed by `yawaragi_session`). During the ADR-0020 grill the maintainer changed the product shape: the journal is something they need **permanently, from day one, for themselves**, and are willing to build authorization to get. The public does not get their own persistent journal in v1 — they get a *worked example*.

These two threads reframe, and partly overturn, ADR-0019. ADR-0019 optimised for "every anonymous visitor gets a throwaway personalised vector without auth or a Pro upgrade." The new optimisation is "the maintainer dogfoods a real permanent journal behind auth; the public sees the feature working as a polished example." That is a different decision, so this ADR **supersedes ADR-0019** rather than extending it.

Enabling facts discovered during the grill:

- **The auth + RLS infrastructure is already built.** `@clerk/nextjs` is installed and wired (`ClerkProvider` in the locale layout, `src/proxy.ts`, `src/env.ts`); the user-scoped Supabase seam exists and is type-fenced — `getUserScopedClient()`, `userQuery()`, `src/lib/supabase/db-tables.ts` (disjoint `PublicTable`/`UserTable` unions), and `public-query.test-d.ts` compile fences. `UserTable` is still `never` — no `user_id` table has landed. "Build authorization" is therefore *mostly already paid for*.
- **The real remaining cost of a Postgres journal is the ADR-0011 gate.** The first `user_id` table trips [ADR-0011](./0011-per-env-data-isolation.md): Supabase Pro + Branches must land first, or preview deploys read/write real personal data in the shared project. That is a billing + dashboard step. PRE-GO-LIVE §7.7 already lists Pro as due before launch.
- **`deriveTasteProfile` is a fold.** Per ADR-0019, incremental EMA over a running vector and replaying the raw events with the same weighting produce identical numbers. So where the events live (session vs. account, Redis vs. Postgres) is a storage/erasure decision, not a math decision. The derivation is substrate-agnostic.

## Decision

### 1. The tasting journal is the spine surface; the taste map is its output

- The **[TastingJournal](../../CONTEXT.md#language)** — a User's durable, ordered record of Sakes they have tried, each entry carrying a rating and optional free-text notes — is a first-class surface and the loop everything else hangs off.
- The **[TasteMap](../../CONTEXT.md#language)** (the six-axis radar) is the *derived output view* of the journal, not a separate surface. It is `deriveTasteProfile` rendered.
- The product's surface count in `CONTEXT.md` moves from three to **four**: label scan, search, **tasting journal**, chat recommender. The standalone "taste profile" surface folds into the journal; the nav item "Taste profile" becomes "Journal".

### 2. A journal entry is a richer TasteEvent; one derivation path

- A **JournalEntry** *is* a `TasteEvent` (kind `rating` / `scan_accept` / `cross_beverage_seed`) plus richer fields: free-text `notes`, an explicit `tried_at`, and eventually a scan reference. The journal is the durable, authenticated, richer-fielded superset of the TasteEvent stream.
- There is **one `deriveTasteProfile` fold**, run over whichever event stream applies (ephemeral public demo, or the maintainer's persistent journal). No second derivation code path. The journal feeds the taste map *for free* — which is precisely the "journal-as-spine, taste map downstream" model the research adopted.

### 3. Access model: interactive-but-ephemeral for the public, persistent for the authenticated maintainer

- **Public (unauthenticated):** the journal + taste map are available **only as an interactive example**. A visitor can pick a drink they love (real `resolveCrossBeverageTarget` over the deterministic cross-beverage table), watch the radar shift, and browse sample journal entries — but **nothing persists and it is never framed as "yours."** This keeps the feature legible and impressive for the recruiter / curious-visitor audience (a co-primary audience) without a persistence promise. It carries **no apologetic "Example" badge** (per #236 feedback) — it reads as a real, polished taste map that happens to be pre-populated.
- **Authenticated (maintainer only):** the real, **permanent** journal. Authorization itself is restricted to a **Clerk user-id allowlist** (env var) — there is **no public sign-up in v1**. A non-allowlisted authenticated user is bounced to a "private beta" state.
- The maintainer-only gate limits the GDPR blast radius to one consenting user (the maintainer) while the account-persistence and user-rights surfaces are hardened for public launch.

### 4. Storage: Upstash, user-keyed, no-TTL, behind a store port — Postgres+Pro is the public-launch migration slice

- v1 stores the maintainer's journal in **Upstash Redis, keyed by the Clerk user id, with no TTL** (permanent). This deliberately sidesteps the ADR-0011 Pro gate (Upstash is not governed by ADR-0011) and defers the Pro spend to the public-launch slice — legitimately, since PRE-GO-LIVE already schedules Pro before launch.
- The journal is accessed through a **`JournalStore` port** (the same interface + in-memory-adapter + Upstash-adapter pattern already proven by `TasteEventStore`). Entries are **Zod-schema'd** to one canonical shape regardless of backing. A future **Postgres adapter is a third implementation behind the same interface** — call sites do not change.
- **Postgres + Supabase Pro is the explicit public-launch migration slice**, not this one: it lands the `journal_entries` `user_id` table (flipping `UserTable` off `never`), the RLS policies (the #219 seam is waiting), and a `LRANGE → map → INSERT` backfill that is trivial because v1 has exactly one user's data.
- **Durability backstop:** because Redis is the system-of-record for something we call *permanent*, a `pnpm journal:export` JSON dump ships from day one. It doubles as the GDPR portability path.

### 5. Vocabulary

- Adopt **"tasting journal"** (EN) / **"Verkostungsjournal"** (DE) for the record, and **"taste map"** for the radar view. Retire user-facing **"taste profile"** as a label.
- Keep the internal glossary term **TasteProfile** (the derived six-axis object); its user-facing rendering is "your taste map".
- The internal `TasteEvent` kind `cross_beverage_seed` stays (it accurately names a cold-start seed); only the *user-facing* "seed" wording is retired (already done in #236 values; the `seed*` i18n **keys** are renamed opportunistically when those surfaces are next touched).

### 6. GDPR posture for v1

- Lawful basis: `consent` (personalisation), as in ADR-0019, but now **account-linked** rather than session-pseudonymous. The RoPA row changes from a session-scoped TasteEvents row to an account-scoped JournalEntries row (ADR-0009).
- **Erasure** (`DEL` the user key) and **export** (`journal:export`) hooks ship from day one — cheap, and they de-risk the public-launch rights surface. The full *public-facing* user-rights UI (self-service access / rectification / erasure / portability) is deferred to the public-launch slice, which is acceptable because v1 has no public accounts.
- No Art. 9 special-category data; notes are free-text sake tasting notes, never repurposed.

## What supersession of ADR-0019 changes

- **ADR-0019's core decision is overturned:** anonymous *session-scoped, persisted* taste profiles for all visitors are replaced by (a) an *ephemeral, non-persisted* public example and (b) an *account-persistent* maintainer journal. ADR-0019 is marked `superseded`.
- **Fate of the shipped anonymous code:** the `TasteEventStore` **port and in-memory adapter survive** and are reused. The session-keyed, 24 h-TTL Upstash *instantiation* is replaced by (a) ephemeral client/request state for the public demo and (b) a user-keyed, no-TTL instantiation for the maintainer. The shipped seed form + `deriveTasteProfile` + `forward-lookup.ts` are reused unchanged by the public demo.
- **ADR-0011 still does not fire in v1** — the Upstash journal adds no `user_id` Postgres table. The gate fires at the public-launch migration slice, as intended.
- What ADR-0019 got right and this ADR keeps: derive-don't-store (the fold), provenance-per-input, erasure-as-key-drop, the pure testable derivation.

## Considered options

- **Keep ADR-0019 as-is (anonymous session-scoped for all), add a separate account journal.** Rejected: two persistence models and two derivation paths for the same primitive; and the maintainer explicitly does not want the public to have throwaway personal vectors — they want a worked example plus their own real record.
- **Postgres `journal_entries` + Supabase Pro now.** The "real" substrate and it exercises the built RLS seam, but it forces the Pro spend + dashboard step immediately for a one-user v1. Deferred to the public-launch slice; named as the migration target. The `JournalStore` port keeps that migration a swap.
- **Static read-only public example.** Simplest, and it would let us fully delete the session store. Rejected: a live, interactive demo is materially more compelling for the recruiter / curious audience, and the shipped seed form + fold make interactivity nearly free.
- **Upstash user-keyed no-TTL journal behind a store port (chosen).** Permanent for the maintainer, no Pro gate now, reuses the proven store pattern, and keeps the eventual Postgres migration a trivial adapter-swap + one-user backfill.

## Consequences

- **No public accounts in v1.** Sign-up is closed; authorization is a maintainer allowlist. The public gets an example, not their own data. This is the deliberate cost, and it is the right one for a portfolio-plus-product at this stage.
- **Redis is the system-of-record for the maintainer's permanent journal** until the Postgres migration. The `journal:export` dump is the backstop; Upstash's own persistence + paid-tier backups cover the rest.
- **The public-launch slice is now well-defined:** land Supabase Pro + Branches (ADR-0011), add the `journal_entries` `user_id` table + RLS (#219 seam), write the Postgres `JournalStore` adapter, backfill the maintainer's keys, open sign-up, and ship the full user-rights UI (ADR-0009).
- **`CONTEXT.md` gains `TastingJournal` and `TasteMap` terms** and moves to four surfaces; `TasteProfile`/`TasteEvent` entries are annotated with the journal relationship.
- **The derived taste map still depends on `now`** (time-decay half-life, per ADR-0019) — unchanged; the fold takes `now` as an argument.
