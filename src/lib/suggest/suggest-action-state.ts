import type { DebugEvent } from '@/lib/debug/debug-log'
import type { Suggestion } from '@/lib/schemas/suggestion'

/**
 * Tagged-union return type from `suggestAction`. Lives in a sibling module
 * because Next's `'use server'` rule forbids non-async exports from an
 * actions file (see `src/lib/scan/scan-action-state.ts` for the same
 * split). Types and constants get re-imported on both sides — the page
 * renders a discriminated union of one of these states.
 *
 * The union is deliberately narrower than `scan-action-state.ts` because
 * suggest has fewer branches: it either produced a list, reported empty,
 * hit the rate limit, discovered the MCP transport is down, or crashed on
 * an unexpected error. The scan-action's two-tier retry, ambiguous, brand-
 * only / brewery-only divergences don't exist here — a suggest tool loop
 * is either productive or it isn't.
 */
/**
 * Debug event trail from the action's execution. Populated only when
 * the visitor has debug mode on (`yawaragi_debug=1` cookie, per
 * `isDebugEnabledFromCookies`); absent otherwise so the client-side
 * `<DebugLogPusher />` island short-circuits without a store push. The
 * client bridge lives at `src/components/debug/debug-log-pusher.tsx`
 * — pattern mirrors `scan-form.tsx`'s `useEffect(() => appendDebugEvents(...))`.
 * See `src/lib/debug/debug-log.ts` for the collection mechanism.
 */
type WithDebugLog<T> = T & { debugLog?: ReadonlyArray<DebugEvent> }

export type SuggestActionState = WithDebugLog<
  | {
      status: 'ok'
      suggestions: Suggestion[]
    }
  | {
      status: 'invalid_input'
      reason:
        | 'missing_seed'
        | 'malformed_seed'
        | 'empty_query'
        | 'query_too_long'
        | 'unsupported_locale'
    }
  | {
      status: 'rate_limited'
      retryAfterSec: number
    }
  /**
   * The anonymous-session cookie is missing on the request. Post-#161
   * middleware refactor: the proxy (`src/proxy.ts`) is the sole writer
   * of `yawaragi_session` — actions read only. This state is a "should
   * not happen in practice" defensive branch: every visitor whose
   * request passes through the middleware matcher gets the cookie
   * stamped on the response before the RSC render. It exists so a
   * hypothetical bypass (a matcher gap, a race between middleware
   * runs, a direct action invocation from a test) surfaces as a typed
   * state instead of a thrown exception.
   */
  | {
      status: 'session_missing'
    }
  /**
   * MCP transport / handshake / tool-call failure. The registry factory
   * throws with a "set MCP_SAKENOWA_URL" style message when the env is
   * missing, and the transport itself throws on a network / auth failure
   * against the sakenowa-mcp HTTP endpoint. Both flow through this state
   * so the page can render a "sorry, service unavailable" copy rather than
   * a Next.js error page. Distinct from `error` so the copy can be
   * specific ("our sake database is temporarily unreachable" vs. a
   * generic "something went wrong").
   */
  | {
      status: 'service_unavailable'
    }
  /**
   * Catch-all — LLM produced garbage that failed schema validation, an
   * unexpected exception bubbled out of the tool loop, etc. The page
   * renders a generic error copy. Distinct from `service_unavailable`
   * because the fault is at a different layer.
   */
  | {
      status: 'error'
      reason: string
    }
>

/**
 * The seed carries a bit of contextual detail the LLM needs to write
 * good `reason` prose (`the seed is aromatic and fruit-forward, so we're
 * looking for parallels`). Two shapes supported:
 *
 *   - `brand` — a Sakenowa brandId the tool loop resolves against MCP.
 *     Entered by clicking "Find similar" on a sake detail page.
 *   - `freeform` — a short visitor-typed phrase (`light and floral`,
 *     `smoky whisky`, `something like Yamazaki 12`). The LLM tool loop
 *     uses the MCP tools + optionally `mapCrossBeverage` to translate it
 *     into a candidate list. Cap on `MAX_FREEFORM_QUERY_LEN` at the
 *     schema seam so a runaway paste can't burn through Anthropic tokens.
 *
 * Both variants run through the same server action and share the same
 * `suggestions` rate-limit bucket (3/24h/visitor).
 */
export type SuggestSeed =
  | { kind: 'brand'; brandId: number }
  | { kind: 'freeform'; query: string }

/**
 * Upper bound on a freeform query, enforced at the action's input-
 * validation seam. 200 chars is a generous ceiling — real visitor
 * queries land in the 15-80 char range (`smoky whisky`, `light and
 * floral, low ABV`, `something like Yamazaki 12`). Above 200 chars the
 * visitor is either pasting a paragraph (send them to a chat surface,
 * not a suggest tool loop) or trying to burn tokens.
 */
export const MAX_FREEFORM_QUERY_LEN = 200
