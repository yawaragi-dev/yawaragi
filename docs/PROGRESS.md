# Milestone progress (detail)

_Snapshot generated 2026-07-08T21:06:00.839Z (UTC). Regenerate with `pnpm progress`._

## TL;DR

| Milestone | Phases | Closed / Total issues | Closed / Total LoC weight | Bar |
| --- | --- | --- | --- | --- |
| **M1** — Compliance & i18n foundation | Phase 0 | 5 / 5 | 3938 / 3938 (100%) | `████████████████████` |
| **M2** — Data foundation | Phase 2 | 11 / 12 | 13118 / 13974 (94%) | `███████████████████░` |
| **M3** — Flagship surfaces | Phases 3–5 | 10 / 11 | 8560 / 9416 (91%) | `██████████████████░░` |

## Per-milestone detail

### M1 — Compliance & i18n foundation (Phase 0)

Age gate (JMStV), cookie banner (GDPR), next-intl (en+de), EN-first launch, breach runbook.

**Issues:** 5 closed / 5 total

**Weight (LoC of merged PRs):** 3938 closed / 3938 total — 100% done

`████████████████████████████████████████`

**ETA**

_Complete — no open issues under this milestone._

### M2 — Data foundation (Phase 2)

Sakenowa Postgres mirror, Zod schemas with provenance, attribution UI, flavor chart, Clerk integration.

**Issues:** 11 closed / 12 total

**Weight (LoC of merged PRs):** 13118 closed / 13974 total — 94% done

`██████████████████████████████████████░░`

**ETA**

- **Optimistic:** 2026-07-09
- **Median:**     2026-07-09
- **Pessimistic:** 2026-07-10

_Based on 29 PR(s) merged over the last 14 days (~1089 LoC/day)._

### M3 — Flagship surfaces (Phases 3–5)

Label scan (vision LLM), chat recommender (AI SDK tools + MCP), taste profile + cross-beverage map.

**Issues:** 10 closed / 11 total

**Weight (LoC of merged PRs):** 8560 closed / 9416 total — 91% done

`████████████████████████████████████░░░░`

**ETA**

- **Optimistic:** 2026-07-09
- **Median:**     2026-07-09
- **Pessimistic:** 2026-07-10

_Based on 29 PR(s) merged over the last 14 days (~1089 LoC/day)._

## Methodology

- **Milestones** map to project phases: M1 = Phase 0, M2 = Phase 2, M3 = Phases 3–5. Phase 6+ (evals, polish, community, launch) is excluded — it gates the launch but isn't product surface.
- **Weight per issue** is the sum of `additions + deletions` of the merged PR(s) that closed it (matched by `closes #N` in the PR title). LoC is a blunt instrument but it is measurable, reproducible, and immune to retroactive sizing.
- **Open issues** inherit the median measured slice weight as a prior; the dashboard labels this fall-back so it isn't confused with measured data.
- **Velocity** is total LoC merged in the trailing 14 days divided by the window length in days. Idle days count against velocity: `15240` LoC across `29` PR(s) ⇒ `1088.6` LoC/day.
- **ETA band** is `remaining_weight / velocity` scaled by 1.5x (optimistic), 1x (median), and 0.5x (pessimistic). The 0.5x/1.5x band is wide on purpose — it is not a binomial confidence interval (we lack the ≥8 sprints of history that would justify one), it is a sanity-check window.

## What is NOT measured

- Time-in-review per PR — we only see merged commit timestamps, not when a PR sat waiting for review.
- Cross-issue dependencies — an open slice that blocks three others isn't weighted heavier than a leaf slice of the same LoC.
- Bug discovery rate — post-merge regressions surface as new issues with their own weight, not retroactively against the closing PR.
- Operational / legal blockers (Impressum copy, DPA signings) — tracked in docs/PRE-GO-LIVE.md, not GitHub Issues; they gate launch but don't show up here.
- Phase 6+ (evals, polish, community, launch) — out of scope for the "how close is the product" framing; tracked separately in docs/PRE-GO-LIVE.md §7.
