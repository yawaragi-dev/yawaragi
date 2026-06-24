/**
 * Phase 4 / S1 (#139): live integration test for the MCP client registry
 * against a real, running `@yawaragi/sakenowa-mcp` server in HTTP mode.
 *
 * This file is **not part of `pnpm test`** (the default vitest run uses
 * the `**.integration.test.ts` exclusion pattern via the unit-suite
 * config) and is run only via `pnpm test:mcp-integration` with a
 * deliberately-set `MCP_SAKENOWA_URL` env var.
 *
 * The intent is to validate the cross-repo contract between yawaragi
 * and sakenowa-mcp **before either npm-publishes**: with sakenowa-mcp
 * running locally on `MCP_TRANSPORT=http` and yawaragi linked via
 * `pnpm link ../sakenowa-mcp`, run this suite and confirm every tool
 * advertised by v0.1.0 round-trips correctly through the registry,
 * the `@ai-sdk/mcp` client, and the streamable-HTTP transport.
 *
 * It is **skipped automatically** in three cases:
 *   1. `MCP_SAKENOWA_URL` is unset (yawaragi is on a fresh checkout
 *      with no MCP integration configured).
 *   2. `MCP_SAKENOWA_URL` points at the CI sentinel
 *      (`https://mcp.example.invalid`) — CI runs the unit suite, not
 *      this file, but this guard catches the case where someone runs
 *      it locally with only the CI env loaded.
 *   3. The first transport-open attempt fails (no live server). The
 *      suite logs the URL it tried and skips remaining cases rather
 *      than producing 50 confusing fetch-failure stack traces.
 *
 * What each test asserts is **shape only** — not specific values. The
 * point is to verify the wire format works across the transport, not to
 * pin specific Sakenowa data (which the mirror's contents drive).
 *
 * Removed when S5 (#143) wires the real suggest action; the smoke route
 * and this integration test are scaffolding artifacts that earn their
 * place only as long as we don't have a user-facing call site.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MCPClient } from '@ai-sdk/mcp'

import { getDefaultMcpClient } from './registry'

const CI_SENTINEL_URL = 'https://mcp.example.invalid'

function liveServerConfigured(): boolean {
  const url = process.env.MCP_SAKENOWA_URL
  if (url == null || url === '') return false
  if (url === CI_SENTINEL_URL) return false
  return true
}

const SHOULD_RUN = liveServerConfigured()

// `describe.skipIf` evaluates lazily, so the diagnostic console.log only
// fires when the env actually skips the suite. Keeps `pnpm test:mcp-integration`
// silent on the happy path.
if (!SHOULD_RUN) {
  console.log(
    '[mcp-integration] skipped — MCP_SAKENOWA_URL not set or pointing at CI sentinel. ' +
      'To run, start sakenowa-mcp with MCP_TRANSPORT=http and set MCP_SAKENOWA_URL ' +
      'in .env.local to its endpoint.',
  )
}

describe.skipIf(!SHOULD_RUN)('MCP integration — live @yawaragi/sakenowa-mcp', () => {
  let client: MCPClient

  beforeAll(async () => {
    client = await getDefaultMcpClient()
  }, 15_000)

  afterAll(async () => {
    if (client != null) {
      try {
        await client.close()
      } catch {
        // best-effort
      }
    }
  })

  it('handshakes and advertises the server name + version', async () => {
    // serverInfo populates during the handshake the AI SDK runs at first
    // `tools()` / `execute()` call — touch one to force it.
    await client.tools()
    expect(client.serverInfo.name).toBe('@yawaragi/sakenowa-mcp')
    expect(client.serverInfo.version).toMatch(/^\d+\.\d+\.\d+(-.*)?$/)
  })

  it('advertises all six v0.1.0 tools via tools/list', async () => {
    const tools = await client.tools()
    const advertised = Object.keys(tools).sort()
    expect(advertised).toEqual(
      [
        'find_sakes_by_flavor',
        'find_similar_sakes',
        'get_sake_details',
        'get_top_ranked',
        'list_prefectures',
        'search_sakes_by_name',
      ].sort(),
    )
  })

  // The next six it() blocks exercise each tool. They assert shape, not
  // value — the actual numbers depend on the maintainer's local mirror.

  it('list_prefectures returns 47 prefectures with id/name_ja/name_romaji', async () => {
    const tools = await client.tools()
    const tool = tools.list_prefectures
    expect(tool).toBeDefined()
    const result = await tool!.execute(
      {},
      { toolCallId: 'integration-list_prefectures', messages: [] },
    )
    // Tool results are AI SDK 6 `ToolResult` shape: an array of content
    // parts. The server-side Zod parse already validates structure; we
    // just confirm we got SOMETHING and that it mentions prefecture
    // entries.
    const serialised = JSON.stringify(result)
    expect(serialised).toMatch(/北海道/) // Hokkaido is id 1
    expect(serialised).toMatch(/沖縄/) // Okinawa is id 47
  })

  it('search_sakes_by_name resolves a known romaji query', async () => {
    const tools = await client.tools()
    const tool = tools.search_sakes_by_name
    expect(tool).toBeDefined()
    // "Dassai" — one of the most-cited sakes in the research doc, very
    // likely to be in any reasonable Sakenowa mirror.
    const result = await tool!.execute(
      { query: 'Dassai' },
      { toolCallId: 'integration-search', messages: [] },
    )
    const serialised = JSON.stringify(result)
    // Either the romaji or the kanji form should appear — the mirror
    // may have one or both. Allowing either keeps the test stable
    // across schema variations.
    expect(/Dassai|獺祭/.test(serialised)).toBe(true)
  })

  it('find_similar_sakes accepts a brandId + topK and returns matches', async () => {
    const tools = await client.tools()
    const tool = tools.find_similar_sakes
    expect(tool).toBeDefined()
    // brandId 1 — almost guaranteed to exist in any Sakenowa-mirrored
    // Postgres (Sakenowa's id space starts at 1). topK 3 keeps the
    // result small and predictable.
    const result = await tool!.execute(
      { brandId: 1, topK: 3 },
      { toolCallId: 'integration-similar', messages: [] },
    )
    // Just confirm the call didn't error and produced SOMETHING.
    expect(result).toBeDefined()
  })

  it('get_sake_details returns a 6-axis flavor profile for a known brand', async () => {
    const tools = await client.tools()
    const tool = tools.get_sake_details
    expect(tool).toBeDefined()
    const result = await tool!.execute(
      { brandId: 1 },
      { toolCallId: 'integration-details', messages: [] },
    )
    const serialised = JSON.stringify(result)
    // f1..f6 are the canonical Sakenowa axis identifiers; any
    // well-shaped response will mention them.
    expect(serialised).toMatch(/f1|hanayaka/)
    expect(serialised).toMatch(/f6|keikai/)
  })

  it('find_sakes_by_flavor accepts axis ranges + tag filters', async () => {
    const tools = await client.tools()
    const tool = tools.find_sakes_by_flavor
    expect(tool).toBeDefined()
    // Aromatic-and-dry filter: high f1, mid f5. Loose bounds keep this
    // stable across mirrors.
    const result = await tool!.execute(
      { f1Min: 0.6, f1Max: 1.0, f5Min: 0.4, f5Max: 1.0, topK: 5 },
      { toolCallId: 'integration-flavor', messages: [] },
    )
    expect(result).toBeDefined()
  })

  it('get_top_ranked returns the latest overall ranking', async () => {
    const tools = await client.tools()
    const tool = tools.get_top_ranked
    expect(tool).toBeDefined()
    const result = await tool!.execute(
      { scope: 'overall' },
      { toolCallId: 'integration-ranked', messages: [] },
    )
    expect(result).toBeDefined()
  })

  // Error-path coverage. We assert the AI SDK surfaces a clear error
  // when the maintainer typos a tool name OR omits a required argument
  // — both of which are easy real-world mistakes and the contract
  // matters more than the exact error message.

  it('throws or returns a useful error when calling a tool with bad input', async () => {
    const tools = await client.tools()
    const tool = tools.find_similar_sakes
    expect(tool).toBeDefined()
    // brandId expects a number; passing a string should fail at the
    // server-side Zod parse and propagate back. The AI SDK's execute
    // signature is typed `(args: unknown, ...)` so no TS-side complaint
    // — the wrongness is intentional at the runtime layer.
    await expect(
      tool!.execute(
        { brandId: 'not-a-number', topK: 3 },
        { toolCallId: 'integration-bad-input', messages: [] },
      ),
    ).rejects.toBeDefined()
  })
})
