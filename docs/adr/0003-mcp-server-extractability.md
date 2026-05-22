# `apps/mcp/` is Next.js-free, Clerk-free, and product-business-logic-free

The MCP server in `apps/mcp/` and the shared query package `packages/sake-domain/` must not import from `next/*`, `@clerk/*`, or any Yawaragi-specific modules. The MCP server uses framework-agnostic transport — either `@modelcontextprotocol/sdk` directly with stdio, or a thin runtime-agnostic HTTP layer such as Hono. User-aware queries (recommendations personalized to a User's TasteProfile, anything reading Clerk identity) live in `apps/web/src/lib/recommend/`, never in the shared package.

We chose to commit to this constraint at v1 rather than retrofit it later because we intend to extract and open-source the MCP server in v2. Open-source consumers will not have Next.js, Clerk, or our user data — they will have a Postgres mirror of Sakenowa and want a domain-pure read API. Letting Next.js or Clerk dependencies creep into `apps/mcp/` now would force a painful rewrite at extraction time; preventing it costs us nothing today.

## Consequences

The shared `packages/sake-domain/` package is deliberately scoped to types, Zod schemas, and Supabase queries against the Sakenowa-derived tables only. The MCP server's tool surface is limited to domain-pure read operations (`search_sakes_by_name`, `find_similar_sakes`, `get_top_ranked`, etc.) — no `recommend_for_user`, no `get_my_taste_profile`. Those live in the Next.js app and call Clerk and user-owned tables directly. The ingest module may stay in `apps/web/src/lib/sake/ingest/` for v1 but must also remain framework-free so that a v2 extraction to `packages/sakenowa-ingest/` is a directory move, not a rewrite.
