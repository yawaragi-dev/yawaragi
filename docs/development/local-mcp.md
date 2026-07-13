# Local MCP development workflow

Yawaragi's chat / suggest surfaces (Phase 4) consume the MCP server published as **`@yawaragi/sakenowa-mcp`** ([source repo](https://github.com/yawaragi-dev/sakenowa-mcp)). The MCP server lives in its own repository and ships as an npm package per [ADR-0003](../adr/0003-mcp-server-extractability.md) — no `apps/mcp/` workspace in yawaragi.

This doc covers how to develop, smoke-test, and ship a new version of the MCP server against a yawaragi checkout. **Most of the workflow stays out of git** (per-developer machine state). What does land in git is documented in §4 below.

## 1. Active iteration — `pnpm link`

For tight loops where you're editing sakenowa-mcp's source and re-running yawaragi's dev server.

```bash
# In sakenowa-mcp
cd ~/Projects/sakenowa-mcp
pnpm link --global .

# In yawaragi
cd ~/Projects/yawaragi
pnpm link ../sakenowa-mcp
```

This:
- Symlinks `~/Projects/yawaragi/node_modules/@yawaragi/sakenowa-mcp/` → the local sakenowa-mcp checkout
- Modifies `package.json` (adds `"@yawaragi/sakenowa-mcp": "link:../sakenowa-mcp"`)
- Modifies `pnpm-workspace.yaml` (adds an `overrides` block)
- Modifies `pnpm-lock.yaml` correspondingly

### **DO NOT COMMIT THE LINK CHANGES**

CI (`pnpm install --frozen-lockfile`) and Vercel preview builds run on machines that have no `../sakenowa-mcp` checkout. The `link:` protocol will fail to resolve and every build breaks.

Treat `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` as **dirty working-tree state** while developing. Revert before any PR you open against this repo:

```bash
git checkout package.json pnpm-lock.yaml pnpm-workspace.yaml
```

To restore the link after the revert (or after merging upstream), just re-run the `pnpm link ../sakenowa-mcp` command from yawaragi's root.

### Undoing the link

```bash
cd ~/Projects/yawaragi
pnpm unlink @yawaragi/sakenowa-mcp     # or just `git checkout` the three files
```

## 2. Pre-publish smoke — `pnpm pack` + `file:` install

Catches "I forgot to include this in the package's `files` field" bugs that only surface against a real published artifact. Run this **before** every npm publish.

```bash
# In sakenowa-mcp — produces yawaragi-sakenowa-mcp-<version>.tgz
cd ~/Projects/sakenowa-mcp
pnpm pack

# In yawaragi — install from the tarball (NOT a symlink — uses the actual published `files` slice)
cd ~/Projects/yawaragi
pnpm add @yawaragi/sakenowa-mcp@file:../sakenowa-mcp/yawaragi-sakenowa-mcp-0.1.0.tgz
```

Run `pnpm typecheck`, `pnpm test`, `pnpm dev` against the tarball-installed version. Anything that worked under `pnpm link` but fails here is a packaging bug in sakenowa-mcp — fix it there before publishing.

When done:

```bash
git checkout package.json pnpm-lock.yaml pnpm-workspace.yaml
```

## 3. Publishing and go-live ritual

When sakenowa-mcp is ready to ship a release, follow this sequence. **None of these steps can be skipped** without breaking production.

### 3.1 In the sakenowa-mcp repo

1. Run the pre-publish smoke (§2) end-to-end and confirm yawaragi builds + tests pass against the tarball.
2. Bump `version` in `sakenowa-mcp/package.json` to the target version (`0.1.0`, `0.1.1`, etc.). Semver.
3. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
4. `pnpm publish` to npm.

### 3.2 In yawaragi (this repo)

1. **First publish only** — add `@yawaragi/sakenowa-mcp` to `package.json` `dependencies` with a real version range, e.g. `"@yawaragi/sakenowa-mcp": "0.1.0"`. **No caret, no tilde** — pin the exact version until we have a release cadence we trust. Bumps go through dependabot.
2. **First publish only** — add `@yawaragi/sakenowa-mcp` to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` with a one-line documented reason (it's a first-party package; the 14-day Shai-Hulud anti-quarantine doesn't apply per CLAUDE.md anti-pattern guidance).
3. Run `pnpm install` to update the lockfile against the actually-published version (NOT `link:`).
4. Verify: `pnpm typecheck && pnpm lint && pnpm test && pnpm exec playwright test`.
5. Commit `package.json`, `pnpm-lock.yaml`, and (first-publish-only) `pnpm-workspace.yaml`. Open a PR.

### 3.3 Vercel + env

- The MCP server is consumed via the AI SDK 6 MCP client at runtime, reaching out to a streamable-HTTP endpoint per [ADR-0003](../adr/0003-mcp-server-extractability.md) and the Phase 4 PRD (#138).
- `@yawaragi/sakenowa-mcp` v0.1.0 ships both transports natively: the binary defaults to stdio (Claude Desktop / IDE consumer pattern) and switches to streamable HTTP when started with `MCP_TRANSPORT=http`. Production deploys run the HTTP mode behind a TLS-terminating proxy (Vercel rewrite, Cloudflare Tunnel, etc.).
- The yawaragi env var `MCP_SAKENOWA_URL` holds the production MCP-server endpoint (e.g. `https://mcp.yawaragi.dev/mcp`). Set on Vercel (Production + Preview).
- **The MCP server's own `DATABASE_URL` MUST carry `?options=-c search_path=mcp_read,public`** (URL-encoded: `?options=-c%20search_path%3Dmcp_read,public`). This is what enforces the ADR-0014 `superseded_at IS NULL` invariant on the MCP read path (migration `0012` creates the `mcp_read` schema of filtered views; the MCP references tables by bare name so the `search_path` redirects `brands`/`breweries` to those views with **zero MCP code change**). Without it, superseded manual_curation rows leak into chat answers. Standalone OSS users of `@yawaragi/sakenowa-mcp` simply don't set this and are unaffected. Migration `0012` must be applied to the DB **before** the MCP deploy picks up the search_path. See ADR-0014 §"Read-side".
- The CI workflow's `env:` block carries `MCP_SAKENOWA_URL: https://mcp.example.invalid` (RFC 2606 reserved domain — never resolves) so the e2e webserver boots; the smoke route is bearer-gated and registry tests stub `@ai-sdk/mcp` at the module boundary, so no real network call happens in CI.
- For preview-deploy testing of an in-flight MCP change, publish a `beta` tag (`pnpm publish --tag beta`) and pin yawaragi to `0.1.0-beta.0`. Reverts back to stable on cleanup.

### 3.4 Local end-to-end integration testing (BEFORE publish)

This is the cross-repo step that proves both PRs are good before either ships.

```bash
# Terminal 1 — sakenowa-mcp in HTTP mode against a Postgres mirror
cd ~/Projects/sakenowa-mcp
export DATABASE_URL=postgresql://...your-sakenowa-mirror...
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=3030
pnpm dev   # or `node dist/index.js` if you've built

# Terminal 2 — yawaragi pointing at the local MCP server
cd ~/Projects/yawaragi
# .env.local additions:
#   MCP_SAKENOWA_URL=http://localhost:3030/mcp
#   CRON_SECRET=...your-32-byte-secret...
pnpm dev
```

With both running:

- **Smoke** — bearer-gated round-trip against one tool:
  ```bash
  curl -sH "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/debug/mcp-smoke | jq
  ```
  Expected: `{ ok: true, tool: 'list_prefectures', serverName: '@yawaragi/sakenowa-mcp', serverVersion: '0.1.0', result: {...with a 47-prefecture payload...} }`.

- **Tool-coverage integration test** (`src/lib/ai/mcp/mcp-live.integration.test.ts`, S1 onwards) — exercises all six v0.1.0 tools against the live local server:
  ```bash
  MCP_SAKENOWA_URL=http://localhost:3030/mcp pnpm test:mcp-integration
  ```
  Skipped automatically when `MCP_SAKENOWA_URL` is unset OR points at the CI sentinel — so CI doesn't accidentally run it and Vercel previews don't either.

### 3.4 RoPA / observability

- `@yawaragi/sakenowa-mcp` is first-party — no new vendor entry in ADR-0009 RoPA.
- The MCP server's runtime communicates with Supabase (already in the RoPA) and emits Langfuse traces via the same `tracedGenerateText`/`tracedGenerateObject` helpers when called from yawaragi's suggest-action (Phase 4 / S5, #143). No new processor.
- Phase 4 / S7 (#145) closes the phase and updates the README architecture diagram from dotted to solid for the Suggest → MCP path.

## 4. What lands in git

| Path | Status |
|---|---|
| `package.json` link entry | **never** — local-dev only |
| `pnpm-lock.yaml` link entry | **never** — local-dev only |
| `pnpm-workspace.yaml` overrides block | **never** — local-dev only |
| `@yawaragi/sakenowa-mcp` dependency at a real version | once per first publish, then dependabot |
| `pnpm-workspace.yaml` `minimumReleaseAgeExclude` entry | once at first publish |

## 5. Quick checklist before opening any yawaragi PR

If you've been running `pnpm link ../sakenowa-mcp` for local dev, confirm `git status` doesn't show:

- `modified: package.json` with a `link:../sakenowa-mcp` line
- `modified: pnpm-workspace.yaml` with an `overrides` block referencing sakenowa-mcp
- `modified: pnpm-lock.yaml` with `link:../sakenowa-mcp` resolutions

If you do, run `git checkout package.json pnpm-lock.yaml pnpm-workspace.yaml` before pushing. CI catches the mistake (frozen-lockfile install fails), but a 5-minute round-trip is wasted.
