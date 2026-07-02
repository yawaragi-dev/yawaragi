/**
 * TEMPORARY DEBUG ROUTE — `/api/debug/mcp-smoke`
 *
 * Bearer-gated round-trip against the configured `@yawaragi/sakenowa-mcp`
 * server. Exists only to confirm Phase 4 / S1 (#139) infrastructure works
 * end-to-end against a real MCP server before the user-facing suggest
 * action (S5, #143) depends on it. The maintainer runs this once locally
 * (sakenowa-mcp started with `MCP_TRANSPORT=http`), once against a
 * Vercel preview deploy, then DELETE this file in the S5 PR (#143)
 * when the real suggest action takes over — prior phase-4 slices
 * (#150 cross-bev data, #142 mapCrossBeverage) shipped without
 * removing it.
 *
 * Why it lives in `app/api/debug/` and not `app/api/cron/`: it's a
 * developer-tool route, not a scheduled task. Bearer-auth pattern is
 * borrowed from `/api/cron/ingest` because `CRON_SECRET` is the only
 * shared secret already in env.ts that's appropriate for this kind of
 * out-of-band manual invocation. Reusing it keeps the maintainer from
 * having to provision a second 32-byte secret in Vercel for a route
 * that's about to be deleted anyway.
 */
import 'server-only'

import type { MCPClient } from '@ai-sdk/mcp'
import { env } from '@/env'
import { getDefaultMcpClient } from '@/lib/ai/mcp/registry'
import { authorizeCronRequest } from '@/lib/cron/authorize'

// Force Node runtime: @ai-sdk/mcp's transport uses Node-only fetch
// agents under streamable HTTP, and the underlying HTTP client is not
// guaranteed to work on the Edge runtime.
export const runtime = 'nodejs'

// Never cache: this route either succeeds with a fresh tool call or
// reports a fresh failure. A cached "ok: true" from a previous run
// would mask a now-broken MCP server.
export const dynamic = 'force-dynamic'

const RESPONSE_HEADERS = { 'Cache-Control': 'no-store' } as const

function unauthorized(): Response {
  return Response.json({ error: 'unauthorized' }, { status: 401, headers: RESPONSE_HEADERS })
}

/**
 * The tool we exercise on the smoke run. `list_prefectures` is the
 * cheapest, zero-argument tool in the @yawaragi/sakenowa-mcp v0.1.0
 * surface — it returns a fixed list of Japan's 47 prefectures with no
 * input parameters and no per-call cost on the server's Postgres beyond
 * a single SELECT. Verifies the round-trip: registry → transport →
 * MCP handshake → tools/list → tools/call → JSON-RPC response back.
 *
 * Tool name + input shape sourced from
 * ~/Projects/sakenowa-mcp/src/tools/list-prefectures.ts (LIST_PREFECTURES_NAME
 * line 10; ListPrefecturesInputSchema = z.object({}).strict() line 19).
 * If the maintainer renames the tool or the server adds a required
 * argument, this route fails at runtime — which is exactly the smoke
 * signal we want.
 */
const SMOKE_TOOL_NAME = 'list_prefectures'

export async function GET(request: Request): Promise<Response> {
  const authResult = authorizeCronRequest(request.headers.get('authorization'), env.CRON_SECRET)
  if (!authResult.ok) return unauthorized()

  let client: MCPClient | undefined
  try {
    client = await getDefaultMcpClient()
    // `client.tools()` returns an AI SDK tool set keyed by the MCP
    // tool's name. We invoke `execute` directly here rather than
    // routing through `generateText` — this slice is about proving the
    // transport works, not exercising the LLM tool-loop (that's S4).
    const tools = await client.tools()
    const tool = tools[SMOKE_TOOL_NAME]
    if (tool == null) {
      const available = Object.keys(tools)
      return Response.json(
        {
          ok: false,
          error: `Tool "${SMOKE_TOOL_NAME}" not found on MCP server. Server advertised: ${
            available.length === 0 ? '(none)' : available.join(', ')
          }`,
        },
        { status: 502, headers: RESPONSE_HEADERS },
      )
    }
    // `tool.execute` (AI SDK 6 contract) takes the input args + an
    // options bag. `list_prefectures` accepts an empty input per its
    // Zod schema; we pass `{}` rather than `undefined` so the server's
    // `.strict()` parse accepts it.
    const result = await tool.execute({}, { toolCallId: 'smoke', messages: [] })
    return Response.json(
      {
        ok: true,
        tool: SMOKE_TOOL_NAME,
        serverName: client.serverInfo.name,
        serverVersion: client.serverInfo.version,
        result,
      },
      { status: 200, headers: RESPONSE_HEADERS },
    )
  } catch (err) {
    // Return a useful body, NOT a stack trace, so the maintainer's curl
    // shows the actual failure ("connection refused", "URL not set",
    // "tool errored") without having to scrape server logs. The
    // try/catch also stops a transport open failure from leaving a
    // hanging promise rejection.
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: message },
      { status: 500, headers: RESPONSE_HEADERS },
    )
  } finally {
    // Streamable-HTTP transports hold a fetch-stream socket; not
    // closing leaks the connection across requests. allSettled-shape
    // safety via try/await — `close()` itself rejects on already-closed
    // transports, which we ignore (we're done either way).
    if (client != null) {
      try {
        await client.close()
      } catch {
        // intentionally swallowed: best-effort close
      }
    }
  }
}
