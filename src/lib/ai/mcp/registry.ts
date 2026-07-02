import 'server-only'

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { env } from '@/env'

/**
 * Named keys into the MCP-client registry.
 *
 * - `yawaragi-sakenowa`: the only key registered for v1. Points at the
 *   deployed `@yawaragi/sakenowa-mcp` server (per ADR-0003, a separate
 *   first-party OSS asset reached over the network — not an in-repo
 *   workspace). Adds the six read-only tools (`list_prefectures`,
 *   `search_sakes_by_name`, `find_similar_sakes`, `get_sake_details`,
 *   `get_top_ranked`, `find_sakes_by_flavor`) to whatever AI SDK
 *   call-site mounts this client. Phase 4 / S4 (#142) is the first
 *   user-facing surface that mounts them.
 *
 * Future MCP servers slot in as additional string keys here, mirroring
 * the vision-provider registry shape (`src/lib/ai/vision/registry.ts`).
 * The same anti-typo posture applies: an unknown key in
 * `MCP_CLIENT` (future env var, not added in S1) throws rather than
 * silently falling back to the default.
 */
export type McpClientKey = 'yawaragi-sakenowa'

export const DEFAULT_MCP_CLIENT_KEY: McpClientKey = 'yawaragi-sakenowa'

/**
 * Registry — string key to async factory. We register factories rather
 * than instances because (a) opening a transport is an IO operation
 * that should happen at first use, not at module load, and (b) each
 * call site getting a fresh client avoids the "what if two concurrent
 * requests share a closed transport?" footgun until we have a real
 * pooling story.
 *
 * The factory reads `MCP_SAKENOWA_URL` lazily — `env.parse` keeps the
 * value optional (matching the Langfuse / Upstash pattern), but the
 * factory throws with a clear "set MCP_SAKENOWA_URL" message at first
 * use. Same shape as `SESSION_COOKIE_SECRET`'s runtime-first throw.
 *
 * Transport is `'http'` (streamable HTTP, per ADR-0003 + PRD #138).
 * `@yawaragi/sakenowa-mcp` v0.1.0 ships both transports natively
 * (stdio for Claude Desktop / IDE consumers, streamable HTTP selected
 * via `MCP_TRANSPORT=http` on the server side). This client points at
 * the HTTP endpoint directly — no intermediate gateway, no subprocess
 * wrap. Vercel serverless can't keep stdio pipes alive between
 * requests, which is why HTTP is the production-shaped option.
 */
const mcpClientFactories: Record<McpClientKey, () => Promise<MCPClient>> = {
  'yawaragi-sakenowa': async () => {
    const url = env.MCP_SAKENOWA_URL
    if (url == null || url === '') {
      throw new Error(
        "MCP_SAKENOWA_URL is not set. Set it to the deployed @yawaragi/sakenowa-mcp HTTP endpoint (Vercel project URL) — see docs/development/local-mcp.md §3.3.",
      )
    }
    return createMCPClient({
      clientName: 'yawaragi',
      transport: { type: 'http', url },
    })
  },
}

/**
 * The set of known keys, exported so callers (and tests) can discover the
 * full registry without reaching into the factories map.
 */
export const MCP_CLIENT_KEYS: ReadonlyArray<McpClientKey> = Object.keys(
  mcpClientFactories,
) as McpClientKey[]

function isMcpClientKey(value: string): value is McpClientKey {
  return (MCP_CLIENT_KEYS as readonly string[]).includes(value)
}

/**
 * Resolves a string (intended to come from a future `MCP_CLIENT` env
 * var) to a registry key. Unknown values throw — a typo'd env var must
 * not silently fall through to a default that hides the
 * misconfiguration. An unset / empty env var resolves to the default.
 *
 * v1 has only one key (`yawaragi-sakenowa`) so today every call returns
 * the default. The seam is here so the second MCP server (whenever it
 * lands) is selectable by env var swap, not a code rewrite of every
 * call site.
 */
export function resolveMcpClientKey(envValue: string | undefined): McpClientKey {
  if (envValue == null || envValue === '') return DEFAULT_MCP_CLIENT_KEY
  if (!isMcpClientKey(envValue)) {
    throw new Error(
      `Unknown MCP client key=${envValue}. Known keys: ${MCP_CLIENT_KEYS.join(', ')}.`,
    )
  }
  return envValue
}

/**
 * Returns the configured default MCP client for the running environment.
 * The smoke server action (and, later, the suggest action) calls this;
 * tests construct specific clients via `getMcpClient('yawaragi-sakenowa')`.
 *
 * Caller MUST `await client.close()` when done — `createMCPClient`
 * opens a long-lived transport that holds a socket. The smoke route in
 * `src/app/api/debug/mcp-smoke/route.ts` wraps its call in a try/finally
 * to demonstrate the pattern.
 */
export async function getDefaultMcpClient(): Promise<MCPClient> {
  const key = resolveMcpClientKey(undefined)
  return mcpClientFactories[key]()
}

/**
 * Returns the client for a specific registry key. Tests use this
 * indirection to assert the env-driven resolution path doesn't bypass
 * the registry. Caller MUST `await client.close()` when done.
 */
export async function getMcpClient(key: McpClientKey): Promise<MCPClient> {
  return mcpClientFactories[key]()
}
