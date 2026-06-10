# ADR-0013: Every user-facing feature exposes a readable debug trace

## Status

Decided — 2026-06-09

## Context

Phase 3 / S3 (#108, PR #117) shipped the first feature with real LLM dependency: the label-scan vision provider. The first integration test on a live preview deploy turned up a bug Yawaragi had no way to investigate from the outside: a perfectly clean Dassai 45 photo returned "the sake isn't in our catalogue yet," and the operator could not tell whether:

1. The vision model misread the label (kanji wrong),
2. The vision model read it correctly but Sakenowa stored the brewery name in a non-matching form (e.g. `旭酒造株式会社` vs `旭酒造`),
3. The Sakenowa cron had never seeded the production database, or
4. The rate-limiter had silently denied the call upstream of the vision provider.

Each of those failure modes is operationally distinct — fixing the wrong one wastes a day. Vercel function logs are noisy, hard to access from a phone, and surface only what `console.log` was called for. The operator needed an in-app trace they could read mid-investigation.

The label-scan slice ended up shipping with a `?debug=1` cookie-activated overlay that surfaces every step from the originating client component, through the Server Action, into the vision provider, into the Sakenowa lookup, and back. That overlay answered the original question in seconds. The pattern is generally useful and we want to lock it in as the standard before more features land.

Without an explicit rule, the same investigative dead-end will recur every time a new feature's call chain hits production: Phase 4's suggest-action over MCP, the future taste-profile, payment integrations, etc.

## Decision

**Every user-facing feature exposes a readable, opt-in debug trace of its decision-making steps.**

The contract is the same for every feature:

1. **Activation surface is uniform.** The existing `yawaragi_debug` cookie (set via `?debug=1`, cleared via `?debug=0`) is the project-wide toggle. Features do not invent their own activation mechanism.
2. **Server-side traces flow through `AsyncLocalStorage`.** Every feature's entry point (Server Action, route handler, scheduled job) creates a `DebugLog` when the cookie is active and wraps its work in `runWithDebugLog(log, fn)`. Modules deeper in the call chain append events via `debugAdd(source, message, data?, level?)` — no parameter threading through stable seams, no per-module activation logic.
3. **Client-side traces flow through the app-level store.** Components push events via `appendDebugEvents([{...}])`. The store is backed by sessionStorage so the trace survives navigation and reload within a tab.
4. **The overlay is rendered once at layout level**, picks up both server-side traces (mirrored from action results) and client-side traces (pushed directly).
5. **Events are structured and locale-agnostic.** Source-tagged (`Vision`, `Sakenowa`, `RateLimit`, …), level-tagged (`info` / `warn` / `error`), with optional `data` for structured payloads. Event messages stay technical-English — they are logs, not user copy.

Concretely, a new feature is considered debuggable when:

- The originating component (or its action entry) reads `isDebugEnabledFromCookies(...)` and creates a `DebugLog` when activated.
- The action body runs under `runWithDebugLog(log, async () => { ... })`.
- Every meaningful decision point in the feature's path appends at least one event explaining what was decided, what value drove the decision, and what branch was taken.
- The action result carries the accumulated trace under `debugLog?: ReadonlyArray<DebugEvent>`.
- A client-side event is pushed for every user-visible state transition the feature owns (input received, async work started, result rendered).

What counts as a "decision point" is the function call any future operator might want to reason about backwards from a wrong-looking outcome: "did the model say X?" "did the query return Y?" "did the cache hit?" "was the limit exhausted?"

## Security exclusions (load-bearing)

The trace is exposed to anyone who activates the cookie. The activation surface is currently URL-param-driven and unauthenticated — a hardening slice tracking a production gating mechanism is filed as a follow-up issue and **must** land before public launch.

Until that lands, every `debugAdd(...)` call must respect these exclusions:

- **No raw secrets.** API keys, session tokens, full HMAC outputs, full hashed-IP values, signed cookie payloads, Bearer tokens, DB connection strings, OAuth state — none of these go into a debug event under any circumstance. Where a value is part of an identifier (e.g. the cookie sid is the rate-limit key), use a prefix (`abc123…`) so the operator can correlate without leaking the full value.
- **No PII beyond what the visitor knowingly submitted.** The visitor uploaded a photo of a bottle — the kanji extracted from it is fair game. The visitor's IP is not (it's hashed for rate-limiting; hashed values stay out of debug events too, except as prefixes when needed for correlation).
- **No Anthropic / vendor API responses verbatim past what's needed for diagnosis.** Confidence + extracted fields are fine; full model trace, raw cost breakdowns, internal IDs are not.
- **No Stripe / payment vendor data of any kind.** Not pre-launch, not later.
- **No Art. 9 GDPR special-category data.** The label-scan path is bottle labels only — there is no path that could surface health / religion / race data, and CLAUDE.md's existing anti-pattern enforces that the path is never repurposed.

Reviewers checking a new feature's debuggability also check the inverse: every `debugAdd(...)` is examined for accidental leakage. The rule is "would the operator's screenshot during a support conversation cause harm if it landed on Twitter?" — if yes, the field doesn't go in.

## Consequences

**Cost — small, paid up-front per feature:**

- Each new server-side path costs ~5–10 lines of plumbing at the entry (read cookie → create `DebugLog` → wrap body) plus one `debugAdd(...)` per decision point. Decision points were already being logged informally as comments + `console.log` in many cases; this just structures them.
- Each new client component the feature owns gains a per-state-transition `appendDebugEvents([{...}])`. Same pattern as scan-form.tsx.
- New i18n strings only for any new debug-related user-visible chrome (`panel.title` etc. live once at the panel layer; per-feature events are technical-English and not translated).

**Cost — production hardening, before public launch:**

- A bearer-token gate or NODE_ENV restriction must wrap the `?debug=1` activation surface before the project moves from `demo-ready` → `public-launch`. The follow-up issue captures the options and the trade-offs.

**Wins:**

- New features become debuggable on day one rather than after a separate "wire up observability" slice.
- The pattern is uniform: any operator opening any feature with `?debug=1` knows what shape to expect in the panel.
- Support investigations on real preview / production traffic shrink from "screen-share + check Vercel logs + reproduce" to "send the visitor a debug-enabled URL and ask them to redo the action."
- The pattern composes: Phase 4 chat-suggestion debugging will read identically to Phase 3 scan debugging, which will read identically to Phase 7 payment debugging — no per-feature observability decisions, no per-feature tooling.

**What this is NOT a substitute for:**

- **Production telemetry.** Langfuse traces (ADR-0009 RoPA: 30-day retention, EU residency) handle aggregate post-hoc analytics — what's the p95 model latency, what fraction of scans no_match, how is rate-limit utilization trending. The debug overlay is per-request, opt-in, ephemeral. The two are complementary; neither is a substitute for the other.
- **Unit / integration tests.** The trace is investigative aid for cases the test suite did not predict. Test coverage stays mandatory.
- **Error reporting.** Sentry / equivalent stays separate. The overlay surfaces non-errors too (successful paths) and is operator-driven, not system-driven.

## Out of scope for this ADR

- The exact UI of the panel (lives in the code, evolves freely).
- The set of `DebugEventSource` values (closed enum, widens as new features land — non-breaking).
- The production-hardening mechanism for the activation cookie (deferred to the linked follow-up).
- Cross-feature event correlation IDs (every action's trace is currently self-contained; if cross-action correlation becomes valuable, that's a future amendment).

## References

- [PR #117](https://github.com/yawaragi-dev/yawaragi/pull/117) — Phase 3 / S3 (vision provider) which also shipped the debug-mode subsystem this ADR codifies.
- `src/lib/debug/debug-log.ts` — server-side accumulator + `AsyncLocalStorage` plumbing.
- `src/lib/debug/debug-store.ts` — client-side store + sessionStorage persistence.
- `src/lib/debug/debug-mode.ts` — cookie + URL-param activation helpers.
- `src/components/debug/debug-panel.tsx` and `debug-panel-mount.tsx` — overlay rendering.
- [ADR-0009](./0009-gdpr-compliance-posture.md) §"Retention is documented per data type" — separates Langfuse aggregate telemetry from per-request debug overlay.
- [Issue #120](https://github.com/yawaragi-dev/yawaragi/issues/120) — follow-up production-hardening issue (bearer-token gate + per-event leakage audit; milestone `public-launch`).
