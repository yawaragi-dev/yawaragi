# Yawaragi 和らぎ

A sake companion. Three flagship surfaces: **label scan**, **chat recommender**, **taste profile**.

> *Yawaragi-mizu* (和らぎ水) is the water drunk between sake sips — a palate reset, not a replacement. This app accompanies and clarifies; it doesn't compete with the sake.

Previously named "Kanpai"; renamed to avoid collision with [KANPAI London Craft Sake Brewery](https://kanpai.london/). Decision and rationale in [`docs/adr/0004-project-name-yawaragi.md`](./docs/adr/0004-project-name-yawaragi.md). Full naming research: [`docs/NAMING-RESEARCH.md`](./docs/NAMING-RESEARCH.md).

## Stack

- Next.js 16 (App Router, RSC by default) · TypeScript strict · Tailwind + shadcn/ui
- Vercel AI SDK 6 for LLM work · `@ai-sdk/mcp` connecting to our own MCP server
- Supabase (Postgres) · Clerk (auth) · Langfuse Cloud (tracing)
- Vitest + happy-dom (unit) · Playwright (E2E + async RSC)
- pnpm

## Getting started

```bash
pnpm install
cp .env.example .env.local   # fill in API keys
pnpm dev
```

## Commands

| Command            | Purpose                                   |
|--------------------|-------------------------------------------|
| `pnpm dev`         | Next dev server                           |
| `pnpm test`        | Vitest, single run                        |
| `pnpm test:watch`  | Vitest watch mode                         |
| `pnpm test:e2e`    | Playwright                                |
| `pnpm lint`        | ESLint                                    |
| `pnpm typecheck`   | `tsc --noEmit`                            |
| `pnpm ingest`      | Refresh Sakenowa data into Supabase       |
| `pnpm eval`        | Run eval golden sets                      |

## Project documentation

- [`CLAUDE.md`](./CLAUDE.md) — agent operating instructions, conventions, anti-patterns
- [`CONTEXT.md`](./CONTEXT.md) — domain glossary; read before naming variables/types
- [`docs/adr/`](./docs/adr) — architecture decision records
- [`docs/PRE-GO-LIVE.md`](./docs/PRE-GO-LIVE.md) — hard gates before any public launch
- [`docs/NAMING-RESEARCH.md`](./docs/NAMING-RESEARCH.md) — naming decision rationale

## Open-source

The MCP server that exposes the Sakenowa-mirrored sake catalogue is published separately as **`@yawaragi/sakenowa-mcp`** (planned). It deliberately depends on neither Next.js nor Clerk nor any Yawaragi-specific logic, so anyone with a Sakenowa mirror in Postgres can run it standalone. See [`docs/adr/0003-mcp-server-extractability.md`](./docs/adr/0003-mcp-server-extractability.md).

## Attribution

Sake data is sourced from the [Sakenowa Data API](https://muro.sakenowa.com/sakenowa-data/api/). "Flavor Chart" is a registered trademark of Sakenowa.

## Licence

Open-core. Application code is All Rights Reserved; the cross-beverage map (CC BY-NC-SA 4.0), the glossary (CC BY-SA 4.0), and the Zod schemas (MIT) are permissively licensed. See [`docs/LICENSE-STRATEGY.md`](./docs/LICENSE-STRATEGY.md) and [`LICENSE`](./LICENSE).

The MCP server [`@yawaragi/sakenowa-mcp`](https://github.com/yawaragi/sakenowa-mcp) lives in its own repo and is MIT-licensed.
