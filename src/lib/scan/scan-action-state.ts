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

export const INITIAL_SCAN_ACTION_STATE: ScanActionState = { status: 'idle' }
