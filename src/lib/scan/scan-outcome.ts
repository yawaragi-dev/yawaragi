import type { ActionOutcome } from '@/lib/ai/observability/action-span'
import type { ScanActionState } from './scan-action-state'

/**
 * Maps a scan result onto a Langfuse outcome (#287).
 *
 * In a sibling module rather than `scan-action.ts` because Next's
 * `'use server'` rule forbids non-async exports from an actions file, and
 * these severity decisions need to be unit-testable — they ARE the feature,
 * so an untested edit could silently demote the signal #287 exists to raise.
 *
 * Severity follows "did the visitor get an answer", not "did the code work".
 * `no_match` and `low_confidence` are honest outcomes for a blurry or unknown
 * bottle, so they sit at WARNING — worth watching as a rate, not worth paging
 * on. `extraction_failed` is ERROR: the model returned nothing usable even
 * after the tier-2 retry, which is a pipeline failure rather than a property
 * of the photo.
 */
export function classifyScanOutcome(state: ScanActionState): ActionOutcome {
  switch (state.status) {
    case 'matched':
      return { outcome: 'matched' }
    case 'matched_brand_only':
    case 'matched_brewery_only':
    case 'ambiguous':
      return { outcome: state.status, level: 'DEFAULT' }
    case 'no_match':
    case 'low_confidence':
      return { outcome: state.status, level: 'WARNING' }
    case 'extraction_failed':
      return {
        outcome: 'extraction_failed',
        level: 'ERROR',
        statusMessage: 'vision returned nothing usable after the tier-2 retry',
      }
    case 'rate_limited':
    case 'invalid_input':
    case 'idle':
      return { outcome: state.status, level: 'DEFAULT' }
    case 'session_missing':
      return { outcome: 'session_missing', level: 'WARNING' }
    default:
      return { outcome: 'unclassified', level: 'WARNING' }
  }
}
