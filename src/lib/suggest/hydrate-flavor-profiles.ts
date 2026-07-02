import 'server-only'

import { z } from 'zod'
import type { Suggestion } from '@/lib/schemas/suggestion'
import { SuggestionSchema } from '@/lib/schemas/suggestion'

/**
 * Phase 4 / S5 round-2 fan-out — attach `flavor_profile` to each
 * Suggestion by calling the MCP `get_sake_details` tool per brandId in
 * parallel.
 *
 * Split from `suggest-action.ts` so the fan-out is unit-testable without
 * spinning up an MCP client, a language model, or the rate-limit gate.
 * The action wires the LLM tool loop and this post-enrichment together;
 * both halves stay simple by construction.
 *
 * Provenance invariant
 * --------------------
 * The `flavor_profile` field is pinned to `source: 'sakenowa'` at the
 * schema seam (`src/lib/schemas/suggestion.ts` § `FlavorProfileField`).
 * That pin only holds if the value genuinely comes from Sakenowa —
 * hence the deterministic fan-out here, and NOT letting the LLM emit
 * axis values through the tool loop. If a future refactor moves flavor
 * axes into the LLM's output, the schema's literal-source check would
 * force the same conversation again.
 *
 * Failure isolation
 * -----------------
 * `Promise.allSettled` is mandatory. A single MCP call failing (network
 * flake, brand row missing, tool disabled) must not fail the whole
 * action — the visitor still benefits from the LLM's reasoning even if
 * a flavor chart is temporarily unreachable. The card renders without
 * the axis cluster in that case; no placeholder, no "N/A".
 *
 * Parallel dispatch
 * -----------------
 * The fan-out adds ONE round-trip of latency, not N. Sequential
 * dispatch would multiply the wait by the number of suggestions
 * (typically 3-6), which is unacceptable for a page that already sat
 * through the LLM tool loop. Parallel is a hard invariant asserted by
 * the peak-in-flight test in `hydrate-flavor-profiles.test.ts`.
 */

/**
 * The subset of the AI SDK MCP tool interface we exercise here — the
 * `execute` function on `get_sake_details`. Typed loosely (input as
 * `unknown`, output as `unknown`) so the caller can pass either a real
 * `ToolSet` from `client.tools()` or a hand-rolled test double without
 * fighting variance. The parse layer downstream (structuredContent →
 * content-text fallback → Zod) is the real safety net.
 */
interface McpToolLike {
  execute: (
    args: unknown,
    options: { toolCallId: string; messages: [] },
  ) => Promise<unknown>
}

/**
 * The MCP `get_sake_details` output shape, mirrored from the
 * `@yawaragi/sakenowa-mcp` package's `GetSakeDetailsOutputSchema`. We
 * re-declare here rather than import from the package because (a) the
 * package's schema uses different Zod version internals that would
 * cross-contaminate, and (b) a wire-shape contract deserves an explicit
 * checked-in shape at the consumer boundary — a silent shift on the
 * server side would surface here as a parse failure, not a runtime
 * crash deep in the suggest render path.
 *
 * `flavorProfile: null` is a valid successful result (brand row with no
 * `flavor_charts` join). `found: false` is also valid (unknown brandId).
 * Only those two success shapes are recognised — anything else drops
 * silently to "no flavor_profile".
 */
const McpFlavorProfileWire = z.object({
  f1: z.number(),
  f2: z.number(),
  f3: z.number(),
  f4: z.number(),
  f5: z.number(),
  f6: z.number(),
})

const McpGetSakeDetailsWire = z.discriminatedUnion('found', [
  z.object({ found: z.literal(false), brandId: z.number() }),
  z.object({
    found: z.literal(true),
    flavorProfile: McpFlavorProfileWire.nullable(),
  }),
])

/**
 * The transport-layer wrapper: MCP CallToolResult with `content` +
 * optional `structuredContent`. `structuredContent.details` is the
 * canonical carrier (per `sakenowa-mcp`'s `structuredKey: 'details'`),
 * with the JSON-encoded text fallback for future MCP servers that skip
 * structuredContent.
 */
const CallToolResultLike = z.object({
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }).loose())
    .optional(),
  structuredContent: z
    .object({ details: z.unknown().optional() })
    .loose()
    .optional(),
  isError: z.boolean().optional(),
})

export async function hydrateFlavorProfiles(
  suggestions: Suggestion[],
  tools: Record<string, unknown>,
): Promise<Suggestion[]> {
  // Defence-in-depth: if a future MCP version renames or drops
  // `get_sake_details`, the fan-out is a silent no-op rather than a
  // crash. The action's happy path degrades to "cards without flavor
  // clusters" — the same UX as brands with no chart in the mirror.
  const tool = tools.get_sake_details as McpToolLike | undefined
  if (tool === undefined || typeof tool.execute !== 'function') {
    return suggestions
  }

  // Parallel dispatch. `Promise.allSettled` is load-bearing — a single
  // rejected promise must not sink the batch. Test-asserted in
  // `hydrate-flavor-profiles.test.ts` § "fans out in parallel".
  const results = await Promise.allSettled(
    suggestions.map((s) =>
      tool.execute(
        { brandId: s.brandId.value },
        { toolCallId: `hydrate-${s.brandId.value}`, messages: [] },
      ),
    ),
  )

  return suggestions.map((s, i) => {
    const settled = results[i]
    if (settled.status !== 'fulfilled') return s

    const flavorProfile = extractFlavorProfile(settled.value)
    if (flavorProfile === null) return s

    // Re-parse the enriched suggestion through the schema so the
    // pinned source (`sakenowa`) and axis-range invariants are enforced
    // at the seam. If parse fails (e.g. an out-of-range axis snuck
    // through the MCP layer), drop the flavor_profile silently — the
    // Suggestion still renders, just without the cluster.
    const candidate = {
      ...s,
      flavor_profile: {
        source: 'sakenowa' as const,
        ...flavorProfile,
      },
    }
    const parsed = SuggestionSchema.safeParse(candidate)
    return parsed.success ? parsed.data : s
  })
}

/**
 * Extract the raw `{f1..f6}` axis object from an MCP CallToolResult, or
 * `null` when no chart is available. Prefers `structuredContent.details`
 * (the canonical carrier per `sakenowa-mcp`'s tool-definition contract);
 * falls back to parsing `content[0].text` for a future MCP server that
 * skips structuredContent. All parse failures return `null` — the
 * calling seam treats `null` as "no chart".
 */
function extractFlavorProfile(rawResult: unknown): {
  f1: number
  f2: number
  f3: number
  f4: number
  f5: number
  f6: number
} | null {
  const outer = CallToolResultLike.safeParse(rawResult)
  if (!outer.success) return null
  if (outer.data.isError === true) return null

  const structured = outer.data.structuredContent?.details
  const details = structured !== undefined ? structured : extractFromTextContent(outer.data.content)
  if (details === undefined) return null

  const parsed = McpGetSakeDetailsWire.safeParse(details)
  if (!parsed.success) return null
  if (parsed.data.found !== true) return null
  return parsed.data.flavorProfile
}

function extractFromTextContent(
  content: Array<{ type: string; text?: string }> | undefined,
): unknown {
  if (content === undefined || content.length === 0) return undefined
  const first = content[0]
  if (first.type !== 'text' || first.text == null) return undefined
  try {
    return JSON.parse(first.text)
  } catch {
    return undefined
  }
}
