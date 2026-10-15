import type { ActionOutcome } from '@/lib/ai/observability/action-span'
import type { ListActionState } from './list-action-state'

/**
 * Maps a list read onto a Langfuse outcome, as `classifyScanOutcome` does for
 * a label: by whether the visitor got an answer. A read that found no sake in
 * the catalogue is an honest answer for a list of unknown sakes, but worth
 * watching as a rate; a read that threw is a pipeline failure.
 */
export function classifyListOutcome(state: ListActionState): ActionOutcome {
  switch (state.status) {
    case 'read': {
      const { rows, unmatched, notSake, unreadableCount, ranked } = state.result
      return {
        outcome: rows.length > 0 ? 'read' : 'read_nothing_matched',
        level: rows.length > 0 ? 'DEFAULT' : 'WARNING',
        metadata: {
          'list.rows': rows.length,
          'list.unmatched': unmatched.length,
          'list.notSake': notSake.length,
          'list.unreadable': unreadableCount,
          'list.ranked': ranked,
        },
      }
    }
    case 'failed':
      return { outcome: 'failed', level: 'ERROR', statusMessage: 'the list read or its lookup threw' }
    case 'session_missing':
      return { outcome: 'session_missing', level: 'WARNING' }
    default:
      return { outcome: state.status, level: 'DEFAULT' }
  }
}
