import type { DebugEvent } from '@/lib/debug/debug-log'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'

/**
 * Tagged-union state returned by `scanAction`. Lives in its own module
 * because Next's `'use server'` rule forbids non-async exports from an
 * actions file — only async functions are allowed. Types and constants
 * have to live somewhere else and be re-imported on both sides.
 */
type ScanActionStateBase =
  | { status: 'idle' }
  | { status: 'invalid_input'; reason: 'missing_image' | 'unsupported_locale' }
  | {
      status: 'matched'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
    }
  /**
   * Phase 3 / #123: the `(brand AND brewery)` exact-match join
   * returned 0 rows, but the brand-only fallback found exactly one
   * match. The brand is unambiguous, but the brewery the model
   * extracted (`breweryDivergence.extracted`) does not match what
   * Sakenowa stores (`breweryDivergence.stored`). The UI MUST surface
   * the divergence honestly and require a deliberate tap to navigate
   * to the sake page — silently routing the visitor to a sake whose
   * brewery doesn't match the label is worse than saying "we're not
   * sure". `sakeHref` is included for the explicit-tap navigation;
   * `useEffect` MUST NOT auto-push to it (see `matched` above for
   * contrast).
   */
  | {
      status: 'matched_brand_only'
      extraction: LabelScanExtraction
      brandId: number
      sakeHref: string
      breweryDivergence: { extracted: string; stored: string }
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
  /**
   * Catch-all for unhandled throws inside the action — Anthropic API
   * outages, the vision schema parse failing after retries on a
   * non-sake image, Sakenowa DB connectivity, etc. Without this state
   * the action would surface a Next.js error digest (`ERROR 3102…`)
   * and the operator would lose the entire server-side debug trace.
   *
   * `reason` is the thrown error's name (e.g. `AI_RetryError`,
   * `ZodError`). The `message` is intentionally NOT carried — full
   * error messages can leak server-side detail. The UI renders a
   * polite localized "couldn't process this image" copy; the panel
   * shows the technical detail via the debugLog the action attached
   * before returning.
   */
  | {
      status: 'extraction_failed'
      reason: string
    }

/**
 * Optional server-side trace attached to every action result when the
 * caller has the debug cookie set (`yawaragi_debug=1`). The client
 * `<DebugPanel />` renders these events alongside its own client-side
 * events (file picked, downscale done, etc.). Undefined when debug is
 * off — and stripped at the server boundary so debug data never leaks
 * to a non-debug visitor.
 */
export type ScanActionState = ScanActionStateBase & {
  debugLog?: ReadonlyArray<DebugEvent>
}

export const INITIAL_SCAN_ACTION_STATE: ScanActionState = { status: 'idle' }
