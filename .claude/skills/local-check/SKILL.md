---
name: local-check
description: Put an open PR on the maintainer's local :3000 for a hands-on check, with a numbered checklist, then merge on their "ok" and put up the next one. Use when the maintainer says "поставь ветку на :3000", "ставь следующий PR на проверку", "I'll check locally", "put PR #N up for review", or otherwise asks to review PRs one by one on localhost.
---

# Local check

The maintainer reviews UI PRs by hand, one at a time, on `http://localhost:3000`. This is the one case where starting :3000 is right (see memory `user-runs-own-dev-server`). The loop: **put up → checklist → their reply → merge (or fix) → put up the next.**

## 1. Pick the PR

- The one they named; otherwise the oldest open PR that changes something they can see. Docs-only and CI-only PRs don't need the loop: merge those on green CI as usual.
- If no PR is waiting, offer `main` itself, listing what merged since their last check that they have not seen.

## 2. Make the branch current

- `unset GITHUB_TOKEN; gh pr view <n> --json mergeable,headRefName,headRefOid`.
- If it is behind main or `CONFLICTING`, rebase it in the worktree that owns it, resolve by intent (memory `rebase-is-integration-not-automation`; CLAUDE.md's design paragraph: take main's side, re-apply the PR's sentence), `pnpm -s typecheck`, push with `--force-with-lease`, check `headRefOid`. CI must run on the new head before the merge, not before the check.

## 3. Put it on :3000

In the main checkout (`/home/bv/Projects/yawaragi`):

1. `git status --short` must be clean (only `AGENTS.md`, rewritten by Next dev, may be dirty: `git checkout AGENTS.md`).
2. Stop the previous :3000 server **by its PID**: `ss -ltnp 'sport = :3000' | grep -o 'pid=[0-9]*'` → `kill <pid>`. Never `pkill`/`killall` by name.
3. `git fetch -q origin && git checkout -q -B <branch> --track origin/<branch>`. If git says the branch is "already used by worktree", that worktree is an agent's whose work is pushed: `git -C <worktree> checkout --detach`, then retry.
4. If `package.json` / `pnpm-lock.yaml` differ from main: `pnpm install --frozen-lockfile`.
5. `pnpm dev > $CLAUDE_JOB_DIR/tmp/dev3000.log 2>&1` with `run_in_background`; wait for `Ready` in the log, then `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/en` → 200. If the log shows Next's "security nudge" telling you to run `next upgrade`, don't run it: restart dev.
6. `git checkout AGENTS.md`.

## 4. The checklist

One message, in the maintainer's language:

- First line: which PR, which branch, that it is on http://localhost:3000.
- **A warning first if any step deletes or rewrites data:** local dev may write their real collection (memory `local-dev-writes-real-collection-data`); suggest a throwaway record, the sample collection, or skipping the step.
- Numbered steps, each with the exact URL path, what to tap, and what they should see (quote the copy). Cover:
  - each acceptance point of the PR;
  - its empty, offline and reduced-motion states where they apply;
  - DE where `de` is open;
  - phone width.
- Name the open decisions that block the merge, if any (an open design decision, a GDPR question).
- End: "Напиши «ок» или что не так".

## 5. On their reply

- **"ok" / "мержи":** CI green on the tip → `git diff --name-only <branch>...origin/main` → `gh pr merge <n> --squash` → check `state`. Write anything they asked for later into a task, so it is not lost.
- **A fix ("снизить высоту", "переименуй"):** make it in the main checkout while the server runs (hot reload lets them see it), measure or screenshot to confirm, commit, push, wait for CI, then merge if they already said merge.
- **"Put up the next one first":** do step 3 for the next PR before merging the current one.
- Then the next PR, from step 1.

## 6. When they stop

"убивай дев-сервак": kill :3000 by PID, then `git checkout AGENTS.md`. Leave the main checkout on `main`, pulled, clean. Delete local branches of merged PRs.
