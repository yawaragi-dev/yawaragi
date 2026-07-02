import { describe, expect, it } from 'vitest'
import type { ToolSet } from 'ai'
import { buildSuggestToolSet } from './tool-set'

// The suggest tool loop's public surface to the LLM is the tool set. The
// two invariants below are what the surface promises the visitor: (1) the
// deterministic cross-beverage tool is always available so the LLM never
// has to invent a mapping, and (2) MCP-domain tools flow through so the
// model can actually look up Sakenowa data. Anything else about the tool
// set is the AI SDK's concern.

// A stand-in for an MCP tool set — we don't invoke it, just check that
// the keys survive the merge. Using `unknown` casts because the AI SDK's
// `Tool` type has a very rich shape and the test doesn't exercise it.
const fakeTool = { execute: async () => ({}) } as unknown as ToolSet[string]

describe('buildSuggestToolSet', () => {
  it('always registers mapCrossBeverage — the LLM cannot invent a cross-beverage mapping', () => {
    const tools = buildSuggestToolSet({})
    expect(Object.keys(tools)).toContain('mapCrossBeverage')
  })

  it('merges MCP tools alongside mapCrossBeverage without dropping them', () => {
    const mcpTools: ToolSet = {
      find_similar_sakes: fakeTool,
      get_sake_details: fakeTool,
    }
    const tools = buildSuggestToolSet(mcpTools)
    expect(Object.keys(tools).sort()).toEqual([
      'find_similar_sakes',
      'get_sake_details',
      'mapCrossBeverage',
    ])
  })

  it('lets the local mapCrossBeverage win if the MCP server ever exposes a same-named tool', () => {
    // Sentinel: a value only present on the fake MCP tool, so the winning
    // entry can be identified by identity even without dereferencing
    // execute().
    const mcpBogusMapCrossBeverage = {
      ...fakeTool,
      __sentinel: 'from-mcp',
    } as unknown as ToolSet[string]
    const tools = buildSuggestToolSet({
      mapCrossBeverage: mcpBogusMapCrossBeverage,
    })
    expect(
      (tools.mapCrossBeverage as unknown as { __sentinel?: string }).__sentinel,
    ).toBeUndefined()
  })
})
