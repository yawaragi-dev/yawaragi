import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  CROSS_BEVERAGE_DESCRIPTOR_ALIASES,
  CROSS_BEVERAGE_MAP,
} from './cross-beverage-data'
import { mapCrossBeverage } from './map-cross-beverage'

// The tool ships as an AI SDK 6 `tool({...})` object; its runtime behaviour
// is entirely inside `execute`. Testing the tool's `execute` directly (not
// via a live LLM loop) is the CLAUDE.md-aligned way to prove the tool
// boundary — no mocked AI SDK, no fake language model, just the pure lookup
// this slice actually ships. The tool's schema-level guarantees (closed-set
// descriptor / beverage enum) are exercised separately by the schema-parse
// tests further down.

// AI SDK 6's `tool.execute` requires a second argument with `toolCallId` and
// `messages` — `messages: []` is semantically meaningless here (no LLM in
// the loop) but the type demands it. Same shape used by the MCP integration
// tests (`src/lib/ai/mcp/mcp-live.integration.test.ts:135`) and the smoke
// route (`src/app/api/debug/mcp-smoke/route.ts:91`).
const EXECUTE_OPTIONS = { toolCallId: 'unit-test', messages: [] }

const executeTool = async (input: { descriptor: string; beverage: string }) => {
  // `mapCrossBeverage.execute` is defined on the tool; the AI SDK types make
  // it optional at the type level (Tool<INPUT, OUTPUT>['execute']) even
  // though this slice always provides one. Assert non-null so the test file
  // isn't littered with `!` at every call site.
  if (mapCrossBeverage.execute == null) {
    throw new Error('mapCrossBeverage.execute is not defined')
  }
  // Cast to unknown-first because the schema-side input type is the closed
  // descriptor+beverage union; tests want to feed unknown strings on the
  // unknown-descriptor path to prove the boundary catches drift.
  return mapCrossBeverage.execute(input as never, EXECUTE_OPTIONS)
}

describe('mapCrossBeverage — happy path', () => {
  it('returns the expected 6-axis vector for a canonical descriptor', async () => {
    // `smoky` / `whisky` is one of the anchor rows in the data table; the
    // vector values below are the ones asserted in `cross-beverage-data.ts`
    // (whisky · smoky row). Any refactor of the tool that silently changed
    // the resolution logic would fail this test.
    const result = await executeTool({ descriptor: 'smoky', beverage: 'whisky' })

    expect(result).toEqual({
      source: 'cross_beverage_map',
      descriptor: 'smoky',
      beverage: 'whisky',
      f1: 0.14,
      f2: 0.75,
      f3: 0.72,
      f4: 0.25,
      f5: 0.70,
      f6: 0.18,
    })
  })
})

describe('mapCrossBeverage — alias resolution', () => {
  it('routes a known alias to the canonical descriptor\'s vector', async () => {
    // `peaty` is an alias for `peated` per CROSS_BEVERAGE_DESCRIPTOR_ALIASES.
    // The tool must round-trip through the alias table before looking up
    // the canonical row so the visitor's colloquial input works.
    const alias = await executeTool({ descriptor: 'peaty', beverage: 'whisky' })
    const canonical = await executeTool({ descriptor: 'peated', beverage: 'whisky' })

    expect(alias).toEqual(canonical)
  })
})

describe('mapCrossBeverage — unknown descriptor', () => {
  it('returns a structured tool-boundary error the LLM can read', async () => {
    // An unknown descriptor must produce a *readable* error (a JSON-serialisable
    // shape the LLM can reason over — "no mapping for X; known descriptors
    // near it: Y"), NOT a thrown Error (which the AI SDK would surface as
    // a generic tool failure) and NOT a silent fallback (which would let
    // the LLM invent mappings — an anti-pattern in CLAUDE.md).
    const result = await executeTool({
      descriptor: 'not-a-real-descriptor',
      beverage: 'whisky',
    })

    expect(result).toMatchObject({
      error: expect.stringContaining('not-a-real-descriptor'),
    })
    // The known-descriptors hint gives the LLM a route back to a valid call
    // ("would `smoky` be close?") rather than silently retrying with garbage.
    expect(result).toMatchObject({
      knownDescriptors: expect.arrayContaining(['smoky', 'peated']),
    })
  })
})

describe('mapCrossBeverage — drift catcher', () => {
  it('every row in CROSS_BEVERAGE_MAP is reachable via the tool', async () => {
    // If a future PR adds a row to `cross-beverage-data.ts` without
    // extending the tool's descriptor union (e.g. because the union was
    // hard-coded rather than derived from the data), this test fails and
    // the maintainer notices before the tool silently rejects the new
    // descriptor in production.
    for (const row of CROSS_BEVERAGE_MAP) {
      const result = await executeTool({
        descriptor: row.descriptor,
        beverage: row.beverage,
      })
      expect(result, `row ${row.beverage}::${row.descriptor} unreachable`).toMatchObject({
        source: 'cross_beverage_map',
        descriptor: row.descriptor,
        beverage: row.beverage,
        f1: row.f1,
        f2: row.f2,
        f3: row.f3,
        f4: row.f4,
        f5: row.f5,
        f6: row.f6,
      })
    }
  })

  it('every alias in CROSS_BEVERAGE_DESCRIPTOR_ALIASES resolves via the tool', async () => {
    // Analogous drift catcher for the alias table: adding an alias without
    // extending the tool's schema-side accepted set would silently drop
    // the visitor's colloquial input.
    for (const [alias, canonical] of Object.entries(CROSS_BEVERAGE_DESCRIPTOR_ALIASES)) {
      const canonicalRow = CROSS_BEVERAGE_MAP.find((r) => r.descriptor === canonical)
      if (canonicalRow == null) {
        throw new Error(`alias table target missing from map: ${canonical}`)
      }
      const result = await executeTool({
        descriptor: alias,
        beverage: canonicalRow.beverage,
      })
      expect(result, `alias ${alias} unreachable`).toMatchObject({
        source: 'cross_beverage_map',
        descriptor: canonical,
      })
    }
  })
})

describe('mapCrossBeverage — provenance envelope', () => {
  it('every success return carries source: "cross_beverage_map"', async () => {
    // The `<HeuristicDisclaimer />` render trigger relies on the source
    // field being pinned to the literal — see `CROSS_BEVERAGE_MAP`'s parse
    // seam (which already pins the literal) and CLAUDE.md's "Cross-beverage
    // disclaimers" rule.
    const result = await executeTool({ descriptor: 'smoky', beverage: 'whisky' })
    expect(result).toMatchObject({ source: 'cross_beverage_map' })
  })
})

describe('mapCrossBeverage — tool contract', () => {
  it('exposes a description the LLM can read', async () => {
    // The description is what the LLM uses to decide when to call this
    // tool. It must exist and mention the deterministic-lookup nature so
    // the S5 (#143) suggest action's system prompt can rely on the model
    // choosing this tool over free-form invention.
    expect(mapCrossBeverage.description).toBeTypeOf('string')
    expect(mapCrossBeverage.description).toMatch(/cross[- ]beverage/i)
  })

  it('input schema rejects a descriptor not in the closed set', async () => {
    // The AI SDK parses `inputSchema` before calling `execute`. This is the
    // load-bearing boundary — the LLM cannot invent a new descriptor
    // because zod refuses to parse it, so `execute` never runs. Proves the
    // "no LLM invention" rule from CLAUDE.md is enforced at the type/parse
    // seam, not just as a defensive belt inside `execute`.
    //
    // We reach through the AI SDK's `FlexibleSchema` wrapper — the
    // underlying zod schema is accessible via `inputSchema` on the tool
    // object; on AI SDK 6 tools built from a plain zod schema, that is
    // the same object we passed in.
    const schema = mapCrossBeverage.inputSchema as z.ZodType<unknown>
    const parsed = schema.safeParse({
      descriptor: 'peat-smoked', // deliberately not in the alias table
      beverage: 'whisky',
    })
    expect(parsed.success).toBe(false)
  })

  it('input schema rejects a beverage outside the enum', async () => {
    // Same closed-set discipline for the beverage column — the enum is
    // pulled from `CrossBeverageMapSchema.shape.beverage` so a future
    // widening (or narrowing) of the schema is inherited automatically.
    const schema = mapCrossBeverage.inputSchema as z.ZodType<unknown>
    const parsed = schema.safeParse({
      descriptor: 'smoky',
      beverage: 'mead', // not in the beverage enum
    })
    expect(parsed.success).toBe(false)
  })
})
