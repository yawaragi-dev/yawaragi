# Agent permissions

`.claude/settings.json` is committed and applies to every Claude Code session in this repo, worktrees included. It holds a short `deny` list for things an agent must never do on its own:

- **Read or edit the env files** that hold real keys (`.env`, `.env.local`, `.env.*.local`, `.env.production`, `.env.development`, `.env.test`). `.env.example` stays readable: it is the list of keys without values. Scripts that load the file themselves (`tsx --env-file=.env.local …`, every `pnpm` script) are unaffected. If you need to know whether a key is set, ask the maintainer rather than looking for a way round the rule.
- **Run the scripts that cannot be undone:** `pnpm db:reset`, `pnpm db:resync` (it starts with `db:reset -- --yes`) and `pnpm journal:erase`. The maintainer runs them by hand, e.g. `! pnpm db:resync` in a session.

Why these: a printed secret costs a rotation, and these three scripts delete data that only a backup brings back.

What the list is not: a security boundary. A deny rule matches the command text Claude writes, and file rules cover Claude's file tools and the shell commands Claude Code recognises (`cat`, `head`, `sed`, redirects). A script that opens the file itself, `sh -c '…'`, or a renamed command gets past it. It stops the ordinary mistake, not a determined process; the sandbox is the boundary if one is ever needed.

Keep the list short. Each entry should be something whose damage cannot be undone; anything that only needs a second look belongs in the maintainer's own `ask` rules in `.claude/settings.local.json`, which is not committed.

`.claudeignore` was removed: Claude Code does not read it (its env lines live here now). Its other entries (`node_modules/`, build output) were never meant to block reads — agents read `node_modules/ai/docs/` on purpose.

Rule syntax: https://code.claude.com/docs/en/permissions
