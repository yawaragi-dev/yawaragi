import 'server-only'

import type { ToolSet } from 'ai'
import { mapCrossBeverage } from '@/lib/ai/tools/map-cross-beverage'

/**
 * Assembles the tool set the suggest tool loop hands to the AI SDK.
 * Extracted from `suggest-action.ts` so the assembly is unit-testable
 * without spinning up an MCP client or a language model — the invariants
 * we want to lock down (mapCrossBeverage registered, MCP tools merged
 * without shadowing) are pure functions of the inputs.
 *
 * Ordering: MCP tools spread first, `mapCrossBeverage` added on top. If
 * the MCP server ever exposes a tool named `mapCrossBeverage` (extremely
 * unlikely — the MCP tools are Sakenowa-domain read-only tools), the
 * local tool wins. That's the right precedence: the local tool has the
 * closed-set descriptor discipline (`src/lib/ai/tools/map-cross-beverage.ts`
 * § "Tool boundary — what this enforces") that a remote tool of the same
 * name might not, and the visitor gets to lean on the local guardrail.
 */
export function buildSuggestToolSet(mcpTools: ToolSet): ToolSet {
  return {
    ...mcpTools,
    mapCrossBeverage,
  }
}
