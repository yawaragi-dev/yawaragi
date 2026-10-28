# Assessment: "A reliable agentic pipeline for Yawaragi"

**Assessed:** 2026-10-28, against `main` at `2b97b78` (the same commit the manual names).
**Document:** [agentic-pipeline-manual.md](./agentic-pipeline-manual.md)
**Status:** advice only. Nothing here is adopted. Settings, hooks, CLAUDE.md, ADRs and branch rules are the maintainer's call.

## Verdict

The manual is well researched and mostly accurate about the repository. Its central diagnosis is right: the checks themselves are strong, and the weak spots are around them — nothing committed stops an agent from running a command that destroys data, the agent merges with the maintainer's own account, and the agent is the only reviewer of much of its own work. About a third of it is worth acting on soon, and most of that is cheap. The rest is a full delivery pipeline for a team: an orchestrator, a WIP limit, brief linting, a calibrated model reviewer, skill evals in CI, mutation testing, a metrics report and a shared plugin repository. One maintainer working through design snapshots would pay for that in friction and API spend, and the failures this repository has actually had would not justify it.

## Repository claims, checked

### Right

- No `.claude/settings.json`, no `.claude/hooks/`, no `.claude/agents/` in the repository. 19 skills under `.claude/skills/`; 13 pinned in `skills-lock.json`; the 6 unpinned ones are exactly `self-review`, `local-check`, `pre-handoff-retro`, `consume-research`, `langfuse`, `mobile-layout-bug-repro`.
- `.claudeignore` lists `.env*`. It does not stop Claude Code from reading those files; only a `Read` deny rule or the sandbox does.
- `db:resync` runs `db:reset -- --yes` itself; `db:reset`, `journal:erase`, `journal:restore`, `romaji:regenerate`, `migrate`, `ingest` all run with `--env-file=.env.local`.
- `ci.yml`: one `verify` job (typecheck, lint, build, unit, integration, both audits, production smoke, e2e); `paths-ignore` on `**/*.md`, `docs/**`, `LICENSE`. So skill edits and CLAUDE.md edits get no CI at all. PR #530 (changed `.claude/skills/local-check/SKILL.md`) is a real example.
- 213 unit test files, 28 Playwright specs, 69 `skip(` calls in `e2e/`.
- CI sets no `DATABASE_URL`, so catalogue-bound e2e specs skip there. The manual says "most likely"; it is certain — `e2e/_db-fixtures.ts` says so in its header comment ("CI … intentionally skips DB-bound e2e").
- PR flow, last 30 days: 163 non-bot PRs merged, median 13 minutes from open to merge, 105 within 30 minutes, median 245 changed lines, 66 over 400. #543 (+1,070 / −1,310) merged ten minutes after opening. All reproduced.
- `CLAUDE.md` is 68,579 bytes; line 186 (the design-port log) is 24,000 characters; line 3 (the Next.js docs index) is 8,684.
- `local-check` step 5 has the agent run `gh pr merge --squash` on the maintainer's "ok", and the skill depends on user-level memories that headless or cloud runs will not see.
- #518 (every Learn page answered 500 in production only) and #525 (production smoke added after it) are described correctly.

### Wrong or stale

- **Branch protection.** The manual says `main` is protected and the rules could not be read. There is no classic branch protection (the API answers "Branch not protected"); there is one active ruleset, `main`, which blocks **only deletion and force-push**. No required status checks, no required pull request, no required review. A direct `git push origin main` is accepted today. This is more serious than the manual assumed and makes its gap 2 stronger.
- **"Force push" in the guard hook.** The regex `git push.*(--force|…)` also matches `--force-with-lease`, which `local-check` uses on purpose to push a rebased PR branch. As written, the hook would break a documented skill step. Force-push to `main` is already refused by the ruleset.
- **#532 as an escaped defect.** It was a planned hardening (the code comment pointed at "a future hardening slice"), not a regression an agent shipped. #518 is the only clear escaped defect it cites.
- **"Read" statuses for hook features.** `onFailure: "block"` on a hook entry and `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` should be checked against the current hooks reference before anyone relies on them. If `onFailure` does not exist, the guard hook fails open whenever the script errors (missing `jq`, not executable), because only exit code 2 blocks.

### Missed (the repository already does it)

- **`pnpm verify`** exists as a script (lint, typecheck, unit, integration, e2e, both audits). The manual mentions it only as a PR-template checkbox. It omits `build` and `test:smoke`, and it calls `npm run` internally, which sits oddly next to CLAUDE.md's "pnpm only" — a small, real inconsistency the manual's I-9 rule (which looks for `npm install`) would not catch.
- **Vitest already refuses `.only` in CI** (its `allowOnly` defaults to off when `CI` is set). Playwright does not: `playwright.config.ts` has no `forbidOnly`. Half of rule I-2 is a one-line config change, not a script.
- **No retries anywhere.** `playwright.config.ts` sets none and the smoke config sets `retries: 0`. That matches the maintainer's "no flaky re-runs" rule; the manual's "flaky retries" metric has nothing to count.
- **Paid evals are already gated by people, not tools.** The eval-batch issue #488 holds changes until one paid run covers several; label-scan evals can replay saved reads offline (`LABEL_SCAN_EVAL_OFFLINE`, plus the read-only `label-scan-pairs` suite). The manual's "ask" rule on `pnpm eval` fits that, but an env-prefixed command (`LABEL_SCAN_EVAL_OFFLINE=1 pnpm eval …`) may not match a `Bash(pnpm eval *)` rule — check before relying on it.
- **`vercel-deploy.yml`** already runs the HTTP smoke and the full e2e suite against a real, database-backed deployment on demand, which covers the catalogue specs CI skips. The manual's G7 is "run this automatically on production", which is a small change, not a new system.
- **The quarterly model review** is there (`model-review-reminder.yml`); the manual mentions it only in passing.
- **Failures this repository has actually had with agents** — a shared `git stash` popping another session's work, `pkill` by name killing the maintainer's dev server, secrets printed to a transcript, agents leaving their worktree — are not in the manual's guard list at all. Its list is generic (drop schema, deploy, force push). The local ones are where a guard would have paid off.

## What is worth doing, ranked by value for effort

1. **Ruleset on `main`: require a pull request and the `Verify` check.** Ten minutes in the GitHub UI, free. Catches a direct push to `main` and a merge on red CI; the maintainer's own note says `gh pr merge --auto` is not a CI gate here because nothing is required.
2. **Committed `Read`/`Edit` deny rules for `.env*`, and `deny` on `db:reset`, `db:resync`, `journal:erase`.** Under an hour, free. These cannot be undone and the repository has had at least one secret-printing incident handled by memory rather than by a rule. Keep the list to irreversible actions; leave `journal:restore --dry-run`, `vercel env ls` and local `RATE_LIMIT_BYPASS=1` usable.
3. **Move the design-port log out of `CLAUDE.md`** into its own file with a pointer. Half a day, free, and it saves about 24k characters of context on every task. It would also end the repeated rebase conflicts on that one paragraph, which today need a manual rule ("agents never edit CLAUDE.md's design paragraph").
4. **Playwright `forbidOnly: !!process.env.CI`, plus a cheap CI job that runs on docs-only PRs** (lint the changed skill files' frontmatter, refuse a new `.only`, refuse an unconditional `.skip`). Under a day, a few CI minutes. Gives skill edits like #530 at least a syntax check.
5. **Run the existing production smoke after each production deploy** (the `deployment_status` trigger the manual describes, reusing `vercel-deploy.yml`'s test job). Half a day, a few CI minutes per deploy. #518 is exactly the class it catches — though `test:smoke` in CI now catches most of that class before merge, so this is the last line, not the first.

Worth a decision but not urgent: a separate GitHub identity for agents (it makes "the agent may not merge" enforceable, but it changes the maintainer's chosen "ok → agent merges" flow); seeding a small catalogue fixture for CI e2e (1–2 days, removes the 61 skips).

## What to reject or defer, and why

- **Stop hook running typecheck, lint and related tests at every turn end.** In interactive sessions that is every reply, including questions and docs work: tens of seconds each time, and it checks `origin/main...HEAD`, so uncommitted edits are not checked at all. Friction without catching anything CI does not.
- **Calibrated `criteria-reviewer` subagent.** Needs briefs with criteria, but recent work comes from design sections and question rounds (7 of the last 80 PRs link an issue). Calibration needs 30 labelled PRs and a monthly re-check. Model spend on every PR. Revisit if escaped defects rise.
- **Skill evals with `claude plugin eval` in CI.** Puts a real `ANTHROPIC_API_KEY` in a public repository's CI, spends money on every `.claude/**` change, and the manual itself says the feature may not be available on this account.
- **Mutation testing, the WIP limit, the orchestrator, `pipeline:report`, the shared plugin repository.** Team-scale machinery. There is no orchestrator to enforce a WIP limit, and the metrics need a run log that nothing writes.
- **Acceptance tests written first and locked (I-3).** Conflicts with CLAUDE.md's "one red, one green" rule; the manual says so itself.
- **400-line size gate and "refactor PRs may not touch tests" (I-7, I-8).** Design ports are naturally large, and a refactor that moves a module (#543) legitimately moves its tests. Both would mostly produce override labels.
- **`.claude/rules/` split of CLAUDE.md.** Plausible, but the compliance rules (provenance, attribution, JMStV, GDPR) apply across paths; scoping them by directory risks an agent not seeing a rule that applies. Only the port log move is clearly safe.

## Security notes on the proposed hooks (section 5.3)

Read these before installing anything.

- **Fails open.** Only exit code 2 blocks. If `jq` is missing, the script is not executable or it errors, the command runs. Add `set -euo pipefail`, check for `jq`, and make any unexpected failure `exit 2`.
- **Text matching is easy to get round** (`x=db; pnpm $x:reset`, `node -e`, a script file the agent writes). The manual says so; the guard is a speed bump, the sandbox and the deny rules are the boundary.
- **False positives that would break real work:** `--force-with-lease` (local-check's rebase step); anything containing "vercel" and "deploy", such as `cat .github/workflows/vercel-deploy.yml`; any command whose text mentions `.env.local`, including a PR body or commit message; `RATE_LIMIT_BYPASS=1`, which is the documented local and preview escape hatch.
- **Gaps:** `git push origin HEAD:main` is not caught (and the ruleset does not stop it today); `pnpm migrate`, `pnpm ingest`, `add-manual-brand` and `rate-limit:reset` write real data and are not in the hook; `cat .env*` or `source .env.local` slip past the `.env` pattern.
- **`echo "$cmd"`** misreads commands starting with `-n` or `-e`; use `printf '%s\n'`.
- **Skill evals in CI** would add an API secret to a public repository's workflows. Use a separate key with a hard spend limit if it is ever done.
- **`.worktreeinclude`** does not exist today. If someone adds it with `.env.local`, every agent worktree gets production secrets; the manual is right to warn about that.

## Decisions this leaves for the maintainer

- Should the agent keep merging on "ok", or should a GitHub approval (and a separate agent identity) become the rule? This is the one real fork, and it changes `local-check` and the "never merge without go-ahead" practice.
- Which ADR records it: none of the existing 26 covers how agents work in the repository. A new ADR ("agent permissions and merge rights") is cleaner than stretching an existing one. ADR-0011 (per-environment data isolation) would need an amendment only if agent worktrees get their own development database and Upstash instead of `.env.local`, which is the manual's `.env.agent` idea and the fix for "local dev writes real collection data".
