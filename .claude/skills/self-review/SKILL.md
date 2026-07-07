---
name: self-review
description: Adversarial self-review of your own pending PR / branch before handing it to the user. Re-loads the spec, diffs intent vs. implementation, audits project rules, surfaces missing doc updates, scores code + test quality, returns structured findings (BLOCKER / MEDIUM / MINOR / NIT). Use when you are about to report work complete, when the user says "self review" / "review your own work" / "check your work" / "are you sure" / "before I look at it", or before handing off a PR for human review.
---

# Self-review

A pre-handoff audit. You ran fast, you cleared the green light, you opened the PR. Stop. Before you tell the user "done", spend ten minutes pretending to be the reviewer. The reviewer is hostile — they're looking for the bug you missed, the spec line you glossed, the doc you forgot to update. Beat them to it.

## Why this exists

A fresh model, scanning your own diff, finds things you can't see anymore. By the time you finish a PR, you've internalised your own choices — they feel obvious and correct. They aren't always. The most common misses:

- **AC drift.** You implemented "the feature" but skipped one bullet of the acceptance criteria. Or you renamed a key. Or you used a shared placeholder where the spec asked for per-instance content.
- **Stale docs.** Code changed; the README diagram, the CLAUDE.md anti-patterns list, an ADR's RoPA table, or a CONTEXT.md glossary entry now lies about reality.
- **Convention drift.** You followed an old pattern from a slice that's since been deprecated, or you replicated an antipattern someone's already filed an issue to remove.
- **Test theatre.** Tests pass but would still pass if you deleted the implementation, or they couple to private internals and will break on the next refactor.

If you can name those misses _yourself_, the reviewer doesn't have to.

## When to run

- **Always** before declaring a PR ready for human review (the bar: "I'm about to write 'PR opened: <url>' in my response").
- When the user says "self review", "review your own work", "check your work", "are you sure", "anything I missed", "before I look".
- After a long stretch of autonomous work where the user hasn't been steering — they're about to context-switch back in and an honest list of "what I'd flag if I were reviewing this" is more useful than a triumphalist summary.

## Skip if

- The change is a trivial config / dep bump / typo fix.
- The user has already reviewed and approved the diff in this session.
- You've already self-reviewed this branch in this session and the diff hasn't grown.

## Process

Run the phases in order. Don't skip phases — the order is load-bearing (you can't audit doc updates without the spec, can't audit conventions without the project rules). Take notes as you go; the output is the structured findings list at the end.

### Phase 1 — Re-load the spec, cold

Before looking at the diff, re-read what was asked for. Don't trust your memory — pull the source of truth:

- **Issue / ticket** for ACs (`gh issue view <n>`, Linear, etc.) — re-read the full body, every checkbox, every "must" / "should" / "do not". List the acceptance criteria as a flat checklist you'll tick against later.
- **PRD / handoff doc** if one exists for this work.
- **Parent issue / epic** for surrounding context the issue body assumes.
- **Linked ADRs / specs** referenced from the issue.

Then re-read the parts of the issue that aren't ACs — the "why", the "what to build" — and check that the implementation reflects the intent, not just the letter of the checkboxes.

### Phase 2 — Re-load the project rules

Open the rule files the project carries — these are the "do this, don't do that" lists that don't always show up in the spec:

- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, any top-level convention doc.
- The "anti-patterns" / "DO NOT" sections specifically — they exist because somebody got burned. Cross-check each entry against the diff.
- Any project-specific check lists: per-PR review questions (e.g. GDPR), test-review checklists, comment style rules.

Note rules that _could_ apply but don't seem to — that's where the easy misses live.

### Phase 3 — Walk the diff

`git diff main...HEAD --stat` for shape; `git diff main...HEAD` for the changes. For each file:

- **Does this file need to change?** Sometimes you edit a file to scratch an itch unrelated to the spec; trim it if so.
- **Is anything missing that should be there?** Cross-reference the ACs from Phase 1.
- **Is anything extra that shouldn't be there?** Speculative abstractions, dead helpers, commented-out code, "in case we need it later" fields.
- **Conventions:** does this file follow the patterns of its neighbours (naming, file layout, error handling, schema location)? If it deviates, is the deviation justified?
- **UI slice?** If the diff touches an interactive surface (a component with state, a click handler, a form, a new route, new visitor-facing copy), run the pre-flight checklist at the bottom of [`docs/agents/ux-design-playbook.md`](../../../docs/agents/ux-design-playbook.md). It exists because the ACs on a UI issue almost never encode 100 ms feedback, dead-end affordances, or discovery framing — see #163 (auto-navigate lost the label photo) and #184 (starter chip had no visible click acknowledgement). Any "no" answer is a BLOCKER-tier finding.

### Phase 4 — Doc-update audit

Code changed. Did the docs that describe that code change with it? Walk this list:

- `README.md` — feature list, architecture diagram, screenshots, install / usage instructions, support matrix.
- `CLAUDE.md` / `AGENTS.md` — convention sections, anti-pattern list, "phase status" / "current state" markers.
- `CONTEXT.md` / domain glossary — new terms introduced? Existing terms now mean something different?
- `docs/adr/*` — new architectural decisions? Updates to an existing decision? RoPA / data-flow tables that now lie?
- `docs/runbooks/*` — operational behaviour changes that on-call would need to know?
- Migration / changelog files.
- API reference / OpenAPI / typedoc generated docs.

The "phase-close" rule deserves its own check: did this PR close out a milestone, phase, or roadmap row that lives somewhere documented? If yes, the doc update belongs in **this PR**, not a follow-up.

### Phase 5 — Code quality

Sample (don't try to read every line — pick representative spots):

- **Comments.** Do they explain WHY (non-obvious context, constraint, invariant) or just WHAT (rephrasing the next line)? WHAT-comments are the easiest cuttable cruft.
- **Types.** Any `any` / `as any` / `@ts-ignore` / `// @ts-expect-error` that doesn't have an inline justification? Type-narrowing casts at boundaries are fine; bypassing the checker in the middle of business logic is not.
- **Error handling.** Are you catching errors you can't act on? Validating input that's already guaranteed by the type system? Adding defensive code for impossible states?
- **Boundaries.** Did you respect the project's module / layer boundaries (e.g. `server-only` markers, schema-location rules, "tools live here, not there")?
- **Speculative scope.** Any code path that exists for "Phase N+1 will want this" — should be deleted; it doesn't belong here yet.

### Phase 6 — Test quality

Run the project's test-review checklist if it has one (CLAUDE.md often does). Otherwise, apply this default:

For each non-trivial test:

1. **Would this test fail if I deleted the implementation?** If no, it's testing the mock or the fixture, not the code.
2. **Would this test fail if I renamed an internal helper but kept the behaviour identical?** If yes, it's coupled to implementation — bad.
3. **Does the test name describe user / caller value, or implementation detail?** "User can complete checkout with expired card" beats "calls validateCard with right args".
4. **Are the assertions specific?** `expect(result).toBeTruthy()` for an object hides bugs; `expect(result).toMatchObject({ key: 'expected' })` doesn't.
5. **Did you write tests AFTER implementation in a batch?** Per CLAUDE.md (and TDD generally), batch-writing tests after the fact tends to test what you implemented rather than what was specified. Flag this as a process note even if the tests are good.

For UI / async-RSC / E2E coverage specifically: did you test the actual public interface (rendered page, API response), or did you stub through to internal collaborators?

### Phase 7 — PR mechanics

- **Title** follows the project's commit / PR conventions?
- **Body** uses the project's template? Closes the right issue (`closes #N`)?
- **Per-PR review questions** answered (GDPR, security, accessibility, whatever the project requires)?
- **Verification matrix** ticked honestly — which checks ran locally, which depend on CI, which were skipped and why?
- **Deviations from spec** explicitly called out? A reviewer should never be surprised by a deviation that wasn't flagged.

### Phase 8 — Triage + report

Sort findings by severity. Use these tiers:

- **BLOCKER** — the PR shouldn't merge as-is. AC missed, project rule violated, doc that now lies about reality, broken contract somewhere.
- **MEDIUM** — should fix before merge, but not catastrophic. Structural mismatch with spec, missing test for an AC, doc drift that's narrow rather than load-bearing.
- **MINOR** — worth addressing if cheap, fine to ship if not. Code-quality cleanups, micro-doc gaps, comment hygiene.
- **NIT** — taste-level. Naming, formatting, comment style. Flag in case the user cares; defer to them.
- **PROCESS** — not about this PR's diff, but about how you got here. "Wrote tests after the fact rather than red-green", "didn't update memory after the user corrected me", "missed an applicable skill". Useful for the user even when the code is fine.

Each finding gets: severity tier, one-line headline, the file / region it applies to (path + line if you can be specific), and a one-sentence suggested fix.

## Output shape

Hand the user a punch list, not an essay. This shape:

```
## Self-review — <branch-or-PR-id>

### BLOCKER (fix before merge)
- [headline]. <file:line> — <suggested fix>.
- ...

### MEDIUM
- ...

### MINOR
- ...

### NIT
- ...

### PROCESS
- ...

### Already verified
- AC checkboxes met: <count>/<total>
- Project rules audited: <list of rule docs read>
- Doc updates considered: <list of doc files audited>
- Tests pass: <count> unit, <count> integration (or "deferred to CI")
- Lint / typecheck / project audits: clean / <which failed>

### What I'd do next
<one or two sentences: fix the BLOCKERs now? ship as-is and follow up? ask user to decide?>
```

If there are no BLOCKERs or MEDIUMs, say so plainly — don't pad the list with NITs to look thorough. An honest "no significant findings; here's the verification matrix" is the goal.

If there ARE BLOCKERs, do not declare the work complete. Either fix them in the same PR and re-review, or hand the user the list and let them decide.

## Failure modes to avoid

- **Performative thoroughness.** Listing 20 NITs to look like you reviewed carefully. The reviewer reads three of them and starts skimming. Land the heavy findings first; cut the noise.
- **Defending your own choices.** If a finding feels uncomfortable, that's signal. Write it down.
- **Re-confirming the green light.** "All tests pass, all lints clean, PR open" is not a self-review. The whole point is finding what tests + lints can't catch.
- **Treating the user as the reviewer.** They are, eventually. But if you can find the issue yourself, the user's time is freed for the things you can't see.
