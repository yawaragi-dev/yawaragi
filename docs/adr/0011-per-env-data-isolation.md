# ADR-0011: Per-environment data isolation via Supabase Branches at the Pro upgrade

## Status

Decided — 2026-05-31

## Context

Vercel Preview deploys and Production currently share one Supabase project. One `DATABASE_URL` value covers `Production` / `Preview` / `Development` env scopes; the migration runner and the ingest script point at the same Postgres regardless of where they run from.

This is fine today, and worth being explicit about why: Phase 2 ships only the Sakenowa reference mirror, which is idempotent public reference data. A preview deploy doing a stray `pnpm ingest` is a no-op on already-fresh data. There is no user data, so there is no user-data corruption surface.

Phase 2.5+ changes the calculus. Taste profiles, brand corrections, rating events are per-user, mutable, and irreplaceable. A buggy preview deploy that writes to the shared DB hits production user state — the exact production-data-corruption surface the project is meant to avoid.

[Issue #70](https://github.com/yawaragi-dev/yawaragi/issues/70) enumerated five options:

| Option | Cost | Isolation | DX |
|---|---|---|---|
| Separate Supabase project for preview | $0 on Free × 2; ~$25/mo extra on Pro × 2 | Hard | Two env-var sets to manage |
| Supabase Branches (per-PR ephemeral DBs) | Pro tier required (already a pre-launch gate); CI integration | Hard | Best — automatic per-PR |
| Schema-scoped (`public_preview` / `public_prod`) | $0 | Soft (same DB) | Migration tooling needs schema awareness forever |
| Read-only preview | $0; needs DB role limits | Half (read OK, write blocked) | Awkward demos |
| Status quo (no isolation) | $0 | None | Best DX, real risk |

Two project-context constraints shape the answer:

1. The Supabase project is being upgraded to **Pro** as a pre-launch gate anyway. [`docs/PRE-GO-LIVE.md` §7.7](../PRE-GO-LIVE.md) records this for PITR (Free tier has no managed point-in-time recovery, and [ADR-0009](./0009-gdpr-compliance-posture.md) requires a documented retention/recovery posture). Pro is on the roadmap regardless of isolation strategy.
2. **Supabase Branches** is a Pro-tier feature that creates a fresh, isolated DB per Git branch / PR, seeded from the production schema (and optionally a subset of production data). Migrations run automatically on branch creation. The branch tears down when the PR closes.

The dominant trade-off is timing: jumping straight to Pro+Branches today costs ~$25/mo for an isolation property that has no business value until the first user-scoped slice queues. Sticking with the status quo until then preserves zero spend until the Pro upgrade is doing two jobs (PITR + isolation) at once.

## Decision

**Two-step plan:**

**Step 1 — today, Phase 2 still on Free tier:** keep the status quo. `Production` / `Preview` / `Development` env scopes share one Supabase project. This is acceptable because every Phase 2 mutation is idempotent public reference data with no user dimension.

**Step 2 — the moment the first user-scoped slice queues (Phase 2.5 starts):** upgrade Supabase to Pro and enable Branches in the same change-set. From that PR forward:

- The `main` branch corresponds to the production Supabase environment.
- Every PR that touches `supabase/migrations/*` or user-scoped tables gets its own Supabase Branch (named after the Git branch). Schema migrations run automatically against the branch DB on branch creation.
- Vercel preview deploys for that PR receive a Supabase Branch-specific `DATABASE_URL` via Vercel's Git integration with Supabase Branches.
- The `Production` env scope retains the production `DATABASE_URL`.

Trigger for Step 2 is **the first PR that adds a table containing `user_id` or any other Clerk-linked identifier**. Encoded as a merge gate (see below).

## Consequences

**Until Step 2 fires, nothing changes.** The `pnpm ingest`, `pnpm db:reset`, and existing slice work continue against the single shared Supabase project. PRE-GO-LIVE §7.7 still tracks Pro upgrade as a launch gate for PITR; this ADR just couples the Branches enablement to the same upgrade event.

**When Step 2 fires:**

- One PR labelled `chore/supabase-pro-and-branches`. Does three things together:
  1. Upgrades the Supabase project to Pro in the dashboard.
  2. Enables the Supabase ↔ Vercel Git integration for Branches.
  3. Updates `docs/PRE-GO-LIVE.md` §7.7 to mark "PITR enabled" + "Branches enabled" both done.
- The maintainer's local workflow gets a new env var: `SUPABASE_BRANCH_NAME` (auto-populated by Vercel for previews; manually set or unset locally).
- `pnpm db:reset --yes` becomes slightly riskier in local dev — make sure it targets the local / branch DB, never production. Add a guard: if `DATABASE_URL` matches the production host AND `--yes` is not paired with a `--prod` flag, abort. Track as a follow-up; not blocking Step 2.

**Vendor lock-in:**

- Supabase Branches is Supabase-specific tooling. If the project ever moves off Supabase, the per-PR ephemeral-DB story has to be rebuilt (the closest open equivalent is GitHub Codespaces + Postgres + a migration runner; doable, not equivalent).
- Acceptable because (a) the Supabase exit is not planned, (b) the alternative — building per-PR DB provisioning in-house — is meaningfully more work than the Branches integration even excluding maintenance cost.

**Cost ceiling:**

- Pro is ~$25/mo per project. Branches do not add per-branch cost on Pro (subject to fair-use limits documented in Supabase's pricing page at upgrade time).
- If the project's monthly cost ceiling tightens later, Step 2's fallback is the "separate Supabase project for preview" option (Pro × 2 ≈ $50/mo), which preserves hard isolation without the Branches DX wins.

**Merge gate (encoded in CLAUDE.md anti-patterns):**

> Phase 2.5+ slices that add or modify any table containing `user_id` (or any other per-user identifier) MUST land in the same merge train as — or after — the Pro+Branches enablement PR. A PR that introduces user-scoped tables while `Production` and `Preview` still share one Supabase project does not merge.

## References

- [Issue #70](https://github.com/yawaragi-dev/yawaragi/issues/70) — surfacing PR.
- [Issue #55](https://github.com/yawaragi-dev/yawaragi/issues/55) — Clerk integration; first slice gated by this ADR.
- [ADR-0009](./0009-gdpr-compliance-posture.md) — GDPR posture; RoPA Supabase row stays accurate (one project today; per-PR branches once Pro lands; Production data location unchanged).
- [ADR-0010](./0010-pg-direct-vs-supabase-js-for-user-data.md) — companion decision on the data-access path for user-scoped reads.
- [`docs/PRE-GO-LIVE.md` §7.7](../PRE-GO-LIVE.md) — Pro tier upgrade already tracked for PITR; this ADR couples Branches enablement to the same change-set.
- [Supabase: Branching](https://supabase.com/docs/guides/deployment/branching) — vendor docs for the per-PR DB feature.
