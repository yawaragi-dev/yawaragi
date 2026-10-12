import type { EarlierScanRead } from '@/lib/schemas/earlier-scan-read'
import { CONFIDENCE_AUTO_THRESHOLD } from './confidence-tier'
import type { ScanActionState } from './scan-action-state'

/**
 * How long a scan's read stays usable for the next photo (#408). Long enough
 * to turn a bottle round and try twice; short enough that a phone picked up
 * again later starts fresh.
 */
export const EARLIER_READ_TTL_MS = 5 * 60 * 1000

/**
 * What the next photo may be resolved together with: the read of the scan on
 * screen, unless that scan was a sure match — then the bottle is settled and
 * the next photo is a new one.
 *
 * The read lives in the scan form's own state and nowhere else, so it is gone
 * when the visitor leaves the scan screen or opens a result.
 */
export function earlierReadOf(state: ScanActionState): EarlierScanRead | null {
  switch (state.status) {
    case 'matched':
      if (state.extraction.confidence >= CONFIDENCE_AUTO_THRESHOLD) return null
      break
    case 'matched_brand_only':
    case 'matched_brewery_only':
    case 'ambiguous':
    case 'no_match':
    case 'low_confidence':
      break
    default:
      return null
  }
  const { name_ja, brewery_ja, other_names, confidence } = state.extraction
  return { name_ja, brewery_ja, other_names, confidence }
}
