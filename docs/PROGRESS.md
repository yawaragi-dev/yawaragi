# Milestone progress (detail)

_Snapshot generated 2026-05-31T19:21:41.054Z (UTC). Regenerate with `pnpm progress`._

## TL;DR

| Milestone | Phases | Closed / Total issues | Closed / Total LoC weight | Bar |
| --- | --- | --- | --- | --- |
| **M1** — Compliance & i18n foundation | Phase 0 | 4 / 5 | 3792 / 4740 (80%) | `████████████████░░░░` |
| **M2** — Data foundation | Phase 2 | 9 / 12 | 11279 / 14123 (80%) | `████████████████░░░░` |
| **M3** — Flagship surfaces | Phases 3–5 | not scoped | not scoped | `░░░░░░░░░░░░░░░░░░░░` |

## Per-milestone detail

### M1 — Compliance & i18n foundation (Phase 0)

Age gate (JMStV), cookie banner (GDPR), next-intl (en+de), EN-first launch, breach runbook.

**Issues:** 4 closed / 5 total

**Weight (LoC of merged PRs):** 3792 closed / 4740 total — 80% done

`████████████████████████████████░░░░░░░░`

**ETA**

- **Optimistic:** 2026-06-01
- **Median:**     2026-06-01
- **Pessimistic:** 2026-06-02

_Based on 34 PR(s) merged over the last 14 days (~1245 LoC/day)._

### M2 — Data foundation (Phase 2)

Sakenowa Postgres mirror, Zod schemas with provenance, attribution UI, flavor chart, Clerk integration.

**Issues:** 9 closed / 12 total

**Weight (LoC of merged PRs):** 11279 closed / 14123 total — 80% done

`████████████████████████████████░░░░░░░░`

**ETA**

- **Optimistic:** 2026-06-02
- **Median:**     2026-06-03
- **Pessimistic:** 2026-06-05

_Based on 34 PR(s) merged over the last 14 days (~1245 LoC/day)._

### M3 — Flagship surfaces (Phases 3–5)

Label scan (vision LLM), chat recommender (AI SDK tools + MCP), taste profile + cross-beverage map.

_No issues filed under this milestone yet._

_Not yet scoped — no issues filed under this milestone._

## Methodology

- **Milestones** map to project phases: M1 = Phase 0, M2 = Phase 2, M3 = Phases 3–5. Phase 6+ (evals, polish, community, launch) is excluded — it gates the launch but isn't product surface.
- **Weight per issue** is the sum of `additions + deletions` of the merged PR(s) that closed it (matched by `closes #N` in the PR title). LoC is a blunt instrument but it is measurable, reproducible, and immune to retroactive sizing.
- **Open issues** inherit the median measured slice weight as a prior; the dashboard labels this fall-back so it isn't confused with measured data.
- **Velocity** is total LoC merged in the trailing 14 days divided by the window length in days. Idle days count against velocity: `17426` LoC across `34` PR(s) ⇒ `1244.7` LoC/day.
- **ETA band** is `remaining_weight / velocity` scaled by 1.5x (optimistic), 1x (median), and 0.5x (pessimistic). The 0.5x/1.5x band is wide on purpose — it is not a binomial confidence interval (we lack the ≥8 sprints of history that would justify one), it is a sanity-check window.

## What is NOT measured

- Time-in-review per PR — we only see merged commit timestamps, not when a PR sat waiting for review.
- Cross-issue dependencies — an open slice that blocks three others isn't weighted heavier than a leaf slice of the same LoC.
- Bug discovery rate — post-merge regressions surface as new issues with their own weight, not retroactively against the closing PR.
- Operational / legal blockers (Impressum copy, DPA signings) — tracked in docs/PRE-GO-LIVE.md, not GitHub Issues; they gate launch but don't show up here.
- Phase 6+ (evals, polish, community, launch) — out of scope for the "how close is the product" framing; tracked separately in docs/PRE-GO-LIVE.md §7.
