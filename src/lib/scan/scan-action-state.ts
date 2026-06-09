import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'

/**
 * Tagged-union state returned by `scanAction`. Lives in its own module
 * because Next's `'use server'` rule forbids non-async exports from an
 * actions file — only async functions are allowed. Types and constants
 * have to live somewhere else and be re-imported on both sides.
 */
export type ScanActionState =
  | { status: 'idle' }
  | { status: 'invalid_input'; reason: 'missing_image' | 'unsupported_locale' }
  | {
      status: 'matched'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
    }
  | {
      status: 'no_match'
      extraction: LabelScanExtraction
    }
  | {
      status: 'ambiguous'
      extraction: LabelScanExtraction
      brandIds: readonly number[]
    }
  /**
   * Phase 3 / S2 (#107): the per-visitor rate limit on the vision-scan
   * bucket has been exhausted. The UI renders a localized "you've
   * reached today's limit, try again in X" message using
   * `retryAfterSec` for the human-readable retry time. No promotional
   * copy per CLAUDE.md JMStV rules — discovery/learning register.
   */
  | {
      status: 'rate_limited'
      retryAfterSec: number
    }
  /**
   * Phase 3 / S3 (#108) PLACEHOLDER: the vision provider produced an
   * extraction whose confidence is below the auto/confirm threshold.
   * S3 has no UI for medium / low confidence yet — S4 (#109) lands the
   * three-tier UX (auto/confirm/retry). Until then the action returns
   * this tagged state and the UI renders a localized "we couldn't read
   * the label clearly, try a closer shot" message. The `extraction` is
   * carried through so a future S4 confirm-card can use it without a
   * second scan.
   *
   * S4 will likely split this into `confirm` (medium) and `retry`
   * (low), at which point the placeholder copy is replaced; the action
   * change is local and the rest of the wire-shape is unaffected.
   */
  | {
      status: 'low_confidence'
      extraction: LabelScanExtraction
    }

export const INITIAL_SCAN_ACTION_STATE: ScanActionState = { status: 'idle' }
