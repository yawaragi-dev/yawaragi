---
name: pre-handoff-retro
description: End-of-session retrospective. Scans for forgotten doc updates, identifies working-style patterns worth memorising, proposes memory + skill artifacts. Use when the user says "retro this", "end of session", "pre-handoff check", "before we hand off", "what did we miss", or otherwise signals they're closing out a working stretch and want the next session (theirs OR a fresh you) to inherit lessons.
---

# Pre-handoff retro

A working session ships a lot. The mistakes get fixed mid-stream and forgotten; the friction patterns get worked around without being named; the docs drift in small ways nobody flags because each small drift was obvious in context. This skill is the 10-minute "what did we leave on the floor" pass before you close the laptop.

## Why this exists

End-of-session is the highest-leverage moment for memory writes: the events are fresh, the lessons are concrete, and the next-session-you (or a fresh agent) is exactly who'd benefit. By contrast, the *middle* of a session is when memory writes get skipped — there's always another PR to ship.

Three classes of thing this catches:

- **Doc drift the session created.** A README claim that was true at the start of the session is now false. A CLAUDE.md anti-pattern got bypassed by an agent and you fixed it but didn't add the rule. An ADR's "decided" wording contradicts what the code actually does.
- **Friction patterns worth memorising.** "Every time you ship an env tightening, CI breaks because you forgot to set the var in the workflow." "Every time you flag a convention drift, the user asks for the lint rule and you have to add it as a follow-up." These patterns repeat. Encoding them stops the repetition.
- **Skill candidates.** A motion you executed three or more times this session and would execute again next session. If you reached for it ad-hoc each time, that's a skill waiting to be written.

## When to run

- User says "retro this", "do a retro", "end of session", "pre-handoff check", "what did we miss", "before we hand off", "wrap-up check".
- You yourself notice you've shipped 5+ PRs / hours of work with no memory writes — propose the retro proactively.

## Skip if

- The session was a single small fix (< 1 PR).
- A retro already ran in this session and the diff hasn't grown meaningfully since.

## Process

Four phases. Don't skip the scan; it's the part you'd most-want to skip and most-want to have done.

### Phase 1 — Sync + inventory

Before opining, pull the actual state:

- `git checkout main && git pull --ff-only` so the session's merges are visible locally.
- `ls` the project's existing skills and memory files. The retro must not duplicate what's already saved.
- Identify the session arc: `git log --oneline --since='<start-of-session>'` or scroll the merged-PR list. Group commits by what they were trying to do.

### Phase 2 — Scan for forgotten updates

Walk this list against the changes the session shipped:

- **`README.md`** — feature list, status text ("Phase X is shipped"), architecture diagram, install / usage. Any current-state claim that the dashboard or commit log contradicts is a finding.
- **`CLAUDE.md` / `AGENTS.md`** — anti-pattern list. Did you ship a new merge-gate rule, lint convention, or banned-pattern detection that should be encoded?
- **`CONTEXT.md`** — glossary. New domain terms? Existing terms whose meaning shifted?
- **`docs/adr/*`** — does any ADR's "decided" wording contradict what the code actually does after this session's changes? Quoting examples: an ADR that said "we'll use X" when the code now uses Y.
- **`docs/PRE-GO-LIVE.md`** — launch-gate items. New surface that needs a "verified once" checkbox before launch?
- **`docs/runbooks/*`** — operational changes on-call would need to know?
- **Auto-regenerated docs** — `docs/PROGRESS.md`, generated API references, etc. — confirm CI / scripts caught them; if not, regenerate manually.

For each finding: cite the file + line, name what's stale, propose the smallest fix.

### Phase 3 — Identify patterns worth encoding

Re-scan the session's friction events. Look for any of these signals:

- **Bug that took longer to diagnose than to fix.** The diagnosis-time was friction. Encode the diagnosis path so next time the diagnosis is instant.
- **Pattern you executed 3+ times.** If you reached for the same bash one-liner / multi-step motion repeatedly, it's a memory or skill candidate.
- **User correction.** Any moment the user pushed back ("why isn't this a lint rule?", "main is fine right?", "merge once green") is a hint about a pattern you should have anticipated.
- **Convention drift surfaced during self-review.** The drift is the symptom; the absence of an enforcement mechanism is the disease. File the rule, not just the fix.
- **Agent-PR misses you had to fix in self-review.** If multiple agents made the same kind of mistake (env tightening, deep imports, doc reconciliation), the agent brief template is missing a checkpoint.

For each pattern: name it, give a 1-sentence "why" tied to a concrete incident from this session, give a 1-sentence "how to apply".

### Phase 4 — Propose + apply

Hand the user a punch list of:

- **Doc fixes** — small, you can do inline.
- **Memory candidates** — 0-N proposed memory file additions, each with a `name`, a one-line `description`, and the `why` / `how to apply` body. Use multi-select so the user picks subset.
- **Skill candidate** — at most one, the highest-value motion that wasn't already a skill. Don't write a skill for every pattern; most belong in memory.
- **Issues worth filing** — for things too big to fix now (e.g., a cross-cutting refactor surfaced by drift). Default to NOT filing; only propose if the user agrees.

Use `AskUserQuestion` with a multi-select for the memories + a single-select for the skill + a single-select for doc-fix scope. Wait for the answer; apply only what the user picks.

## Output shape

```
## Session retro

### Forgotten / drifted updates
- [file:line] — [what's stale] → [proposed fix]

### Patterns worth encoding (memory candidates)
| # | Pattern | Triggered by |
|---|---|---|
| A | [pattern + one-line why] | [concrete session event] |
| ... | | |

### Skill candidate
- [one skill or "none"]

### Already saved
[brief: which existing memory/skill is already covering related ground, so user knows you didn't duplicate]

### Proposed action
[AskUserQuestion with multi-select memories + single-select skill + single-select doc-fix]
```

## Failure modes to avoid

- **Bloat.** A retro that proposes 12 memory additions teaches the next session nothing — the index becomes noise. Cap at 4 memories per retro; if there are more, defer the weakest.
- **Self-congratulation.** "PRs shipped, all green" is not a retro. The retro is what we're going to do differently NEXT session.
- **Skipping the scan because nothing obvious is broken.** The point is to surface what's NOT obvious — the docs everyone forgot, the agents' shared blind spots, the bash one-liner that should be a skill. If you find zero misses on the scan, that's allowed; say so explicitly and move to the patterns phase.
- **Memory duplication.** Always inventory existing memories before writing new ones. If a candidate overlaps with an existing memory, propose an UPDATE to that memory rather than a new file.
