import 'server-only'

import {
  parseSuggestionList,
  SuggestionSchema,
  type Suggestion,
} from '@/lib/schemas/suggestion'

/**
 * Parses the LLM's final text output into a `Suggestion[]`. Split from
 * `suggest-action.ts` so the parse policy (accept a JSON array,
 * accept a `{ suggestions: [] }` envelope, tolerate a ```json fenced
 * block) is unit-testable without spinning up an LLM or an MCP client.
 *
 * The suggest tool loop asks the model to emit its final answer as a
 * JSON array of Suggestion records. Models do this reliably ~95% of the
 * time — the remaining ~5% wrap the array in an envelope, wrap it in a
 * markdown code fence, or emit a leading sentence before the JSON. This
 * function normalises those variations into a single shape before Zod-
 * validating each row.
 *
 * Per-row `safeParse` (rather than a whole-array `parse`) so a single
 * malformed row doesn't drop the entire result list. The model
 * occasionally emits a fifth suggestion where one field is missing; the
 * user still benefits from the first four. This is the same "process the
 * good rows, log the bad ones" posture Sakenowa's ingest uses on the
 * mirror table (`src/lib/sakenowa/lookup.ts`).
 */
export function parseSuggestionsFromText(text: string): Suggestion[] {
  const rows = extractCandidateRows(text)
  const parsed: Suggestion[] = []
  for (const row of rows) {
    const result = SuggestionSchema.safeParse(row)
    if (result.success) parsed.push(result.data)
  }
  // Final list-level parse enforces the layout cap (max 6). Slice defensively
  // in case the model emitted 8 valid rows — surface the first 6, drop the
  // rest silently.
  return parseSuggestionList(parsed.slice(0, 6))
}

/**
 * Extract an array of candidate row objects from whatever shape the model
 * decided to emit. Returns `[]` on any parse failure — the calling seam
 * treats an empty parse as "no match", which renders the honest empty
 * state rather than a crash.
 */
function extractCandidateRows(text: string): unknown[] {
  const trimmed = stripJsonCodeFence(text.trim())
  if (trimmed.length === 0) return []

  const parsed = tryJsonParse(trimmed) ?? tryJsonParse(findFirstJsonSpan(trimmed))
  if (parsed == null) return []

  if (Array.isArray(parsed)) return parsed
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'suggestions' in parsed &&
    Array.isArray((parsed as { suggestions: unknown }).suggestions)
  ) {
    return (parsed as { suggestions: unknown[] }).suggestions
  }
  return []
}

/**
 * If the model wrapped the answer in a ```json ... ``` fence, unwrap it.
 * Otherwise return the input unchanged. The regex is intentionally loose
 * — it accepts ``` or ```json openings and closes on the next triple-
 * backtick.
 */
function stripJsonCodeFence(text: string): string {
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/)
  return fence ? fence[1].trim() : text
}

function tryJsonParse(text: string | null): unknown {
  if (text == null || text.length === 0) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Fallback for models that emit a leading "Here are 4 recommendations:"
 * sentence before the JSON. Finds the first `[` or `{` and returns the
 * substring from there to the matching closing bracket by depth-counting.
 * Returns `null` if no balanced span is found.
 */
function findFirstJsonSpan(text: string): string | null {
  const openIdx = text.search(/[[{]/)
  if (openIdx === -1) return null
  const open = text[openIdx]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escape = false
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\') {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return text.slice(openIdx, i + 1)
    }
  }
  return null
}
