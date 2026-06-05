# `@yawaragi/sakenowa-mcp` is a separate repo, consumed as an npm package, kept Next.js-free / Clerk-free / Yawaragi-free

The MCP server lives in its own GitHub repo at [`yawaragi-dev/sakenowa-mcp`](https://github.com/yawaragi-dev/sakenowa-mcp) and is published to npm as **`@yawaragi/sakenowa-mcp`**. The Yawaragi Next.js app consumes it as a regular npm dependency — there is no `apps/mcp/` workspace in this repo. The MCP server may not import from `next/*`, `@clerk/*`, or anything in this repo. Its tool surface is limited to domain-pure read operations against the Sakenowa-mirrored Postgres schema (`search_sakes_by_name`, `find_similar_sakes`, `get_top_ranked`, etc.). User-aware queries (recommendations personalised to a User's TasteProfile, anything reading Clerk identity) live in the Yawaragi app under `src/lib/recommend/` and never touch the MCP server.

We chose to keep the MCP server as a separate repo published as an npm package — rather than as an in-repo `apps/mcp/` workspace that we'd extract later — because the open-source asset is more valuable when it stands on its own from day one. An external consumer (Claude Desktop user, another sake-tech project, a contributor) can read the repo, run the package, and contribute without ever cloning Yawaragi. The constraints we'd have wanted at v2 extraction (no framework leakage, no business-logic coupling, clean public surface) become table stakes at v1 because the repo's primary audience is external. Treating it as a normal dependency we install via `pnpm add @yawaragi/sakenowa-mcp` also means our `package.json` carries the dependency explicitly, which makes the boundary obvious in code review.

## Consequences

- This repo has **no** `apps/mcp/` directory and **no** `packages/sake-domain/` shared workspace. Both were part of the earlier in-repo-extraction plan and are superseded by this decision.
- The Yawaragi Next.js app installs `@yawaragi/sakenowa-mcp` like any other dependency. The AI SDK connects to it via `@ai-sdk/mcp` per the stack convention in `CLAUDE.md`.
- The MCP server repo carries its own Supabase query layer, its own Zod schemas for Sakenowa data, and its own ingest module. There is short-term duplication with the Yawaragi app — both repos define `Sake`, `Brewery`, etc. The duplication is deliberate: making the MCP server self-contained is the whole point. If duplication later becomes painful, the right move is to publish the shared types as a third npm package (`@yawaragi/sake-types` or similar), not to merge the repos.
- The ingest module (fetch Sakenowa → validate → upsert) lives in the MCP server repo as a CLI (`pnpm ingest` inside `yawaragi-dev/sakenowa-mcp`). Yawaragi's nightly Vercel-cron route handler either invokes that CLI or duplicates the logic; either is acceptable.
- The chat agent's user-aware queries ("recommend for THIS user") live in Yawaragi under `src/lib/recommend/`. They call Clerk and user-owned Supabase tables directly. The MCP server tool surface remains domain-pure and never sees a user identity.

## Amendment — 2026-06-05: cross-beverage map stays in-app

The original "Sakenowa-mirrored read operations only" rule for the MCP tool surface was implicit in the examples (`search_sakes_by_name`, `find_similar_sakes`, `get_top_ranked`). The 2026-06-05 grill made it explicit by testing it against a concrete adjacent case: the **CrossBeverageMap** (whisky / wine / beer descriptors → 6-axis FlavorProfile). Cross-beverage is domain-pure and has no user identity, so it doesn't violate the rule that excludes user-aware queries — but it isn't Sakenowa-mirrored data either. It's our hand-curated bridge table.

The decision: **cross-beverage stays in the Yawaragi app**, exposed to the chat agent as a local AI SDK tool (`src/lib/ai/tools/map-cross-beverage.ts`), not as an MCP tool. The chat agent mixes local AI SDK tools with MCP-sourced tools in one tool surface; the AI SDK supports this directly.

Reasons:

- **Iteration cadence**: cross-beverage table edits would otherwise require a new `@yawaragi/sakenowa-mcp` release per edit. The table is expected to grow and be tuned frequently in early Phase 4; a release dance for each tuning iteration is overhead with no upside.
- **OSS identity**: the MCP server's identity as "the open-source Sakenowa wrapper" is sharper without an adjacent hand-curated heuristic bundled in. External consumers (Claude Desktop users, other sake-tech projects) get exactly what's on the label.
- **Disclaimer co-location**: the `<HeuristicDisclaimer />` rendering requirement (and the existing schema-level `source: 'cross_beverage_map'` provenance enforcement from PR #100) all live in this repo. Splitting the tool definition into the MCP server would split the failure-mode caveat away from where the schema enforces it.

Generalised rule restatement: **the MCP server tool surface is restricted to read operations over the Sakenowa-mirrored schema.** Our own deterministic-but-heuristic mappings (cross-beverage, future cross-domain bridges, hand-curated similarity overrides) stay in the app as local AI SDK tools regardless of whether they happen to be user-aware.

This amendment does not change any other consequence of the original ADR.
