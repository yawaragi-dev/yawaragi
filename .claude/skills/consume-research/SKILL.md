---
name: consume-research
description: Digest an external research doc against the project's current state and capture it durably — save to docs/research, file the actionable issue cluster, reframe the relevant ADR/epic. Use when the user drops a research doc to "consume/digest".
---

An external research doc (feasibility study, competitive analysis, feature design) lands. Its value evaporates unless you (a) **synthesize** it against *current* reality — not summarize it — and (b) leave durable artifacts the next session or agent can act on.

## Process

### 1. Read it in full, then digest — don't summarize

Read the whole thing. Then produce a synthesis, not a recap:

- **What it decides** — the actionable calls, bolded.
- **New vs. already-known** — skip the confirmations; surface the deltas.
- **How it lands against current state** — validate / refine / contradict specific things we've shipped, citing files, PRs, ADRs.
- **Impact on open threads** — which existing issues/ADRs it answers, reorders, or kills.
- **Watch-outs the doc itself flags** — its caveats, unverified claims, legal limits.
- **Your sequencing recommendation** — one or two sharp calls, not a survey.

### 2. Durable capture (offer first; apply only what the user confirms)

- **Save the doc** verbatim to `docs/research/<kebab-name>.md` (alongside the existing research docs). Docs-only PR.
- **File the near-term actionable issues** as a cluster, each linking the doc + the relevant epic. Do NOT file the not-yet-actionable long-tail — capture those *inside* the epic/ADR issue instead, so the backlog stays signal.
- **Reframe the relevant ADR/epic issue** if the research answers its open question: retitle + comment with the adopted direction, so it becomes "the ADR to write", not an open "which?".
- **Update memory** only if the research shifts strategy (a `project`/`feedback` memory) — not for facts that live in the doc itself.

### 3. Name the one decision the research *doesn't* resolve

Almost every research doc leaves one genuine fork for the human (e.g. "where does the journal live — session-scoped vs. account-scoped"). State it explicitly on the reframed issue; resolving it is the ADR's actual job.

## Anti-patterns

- **Summarizing instead of synthesizing** — a recap teaches nothing the doc doesn't already say.
- **Filing an issue for every idea** — file the near-term cluster; park the rest in the epic. Twelve tickets nobody will action is noise.
- **Treating the doc as ground truth** — surface its own caveats (app-store-review "match rates" are not benchmarks; §51 UrhG quotation right is narrow).
- **Capturing before the user confirms** — the digest is the deliverable; the saves/issues are proposed, then applied on a yes.
