import type { ActionOutcome } from '@/lib/ai/observability/action-span'
import type { SuggestActionState } from './suggest-action-state'

/**
 * Maps `suggestAction`'s return value onto a Langfuse outcome (#287).
 *
 * Lives in a sibling module rather than in `suggest-action.ts` for the same
 * reason `suggest-action-state.ts` does: Next's `'use server'` rule forbids
 * non-async exports from an actions file, and this needs to be a plain
 * exported function so it can be unit-tested directly. The severity
 * decisions below ARE the feature — leaving them untestable would mean a
 * future edit could silently demote the very signal #287 exists to raise.
 *
 * `ok` with an EMPTY list is deliberately `WARNING`, not `DEFAULT`. That is
 * the exact shape of the #270 regression — a structurally perfect run that
 * tells the visitor "no matches" — and it is indistinguishable from success
 * in the per-call spans. It is not an error (a genuine no-match is a
 * legitimate answer), so `WARNING` is the honest level: worth charting and
 * alerting on a rising rate, not worth paging over one.
 */
export function classifySuggestOutcome(state: SuggestActionState): ActionOutcome {
  switch (state.status) {
    case 'ok':
      return state.suggestions.length === 0
        ? {
            outcome: 'no_match',
            level: 'WARNING',
            statusMessage: 'tool loop completed but produced no suggestions',
            metadata: { 'suggestions.count': 0 },
          }
        : { outcome: 'ok', metadata: { 'suggestions.count': state.suggestions.length } }
    case 'error':
      return {
        outcome: state.reason,
        level: 'ERROR',
        statusMessage: `suggest failed: ${state.reason}`,
      }
    case 'invalid_input':
      return { outcome: `invalid_input.${state.reason}`, level: 'DEFAULT' }
    case 'rate_limited':
      return { outcome: 'rate_limited', level: 'DEFAULT' }
    case 'service_unavailable':
      return { outcome: 'service_unavailable', level: 'ERROR' }
    case 'session_missing':
      return { outcome: 'session_missing', level: 'WARNING' }
    default:
      // A status added without updating this switch still shows up, rather
      // than vanishing into an unlabelled span.
      return { outcome: 'unclassified', level: 'WARNING' }
  }
}
