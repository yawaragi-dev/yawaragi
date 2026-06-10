/**
 * Confidence-tier resolution for the scan flow.
 *
 * Per PRD #105 §"Three-tier confidence UX" the visitor sees one of
 * three responses based on the vision model's self-reported
 * confidence on the extraction:
 *
 *   - `auto`    — confidence ≥ 0.85 — auto-navigate to the matched sake.
 *   - `confirm` — 0.60 ≤ confidence < 0.85 — show the matched sake on a
 *                 confirm card; visitor taps to navigate or re-scans.
 *   - `retry`   — confidence < 0.60 — no lookup; surface a "try a
 *                 closer shot" CTA and reset.
 *
 * The thresholds are intentionally half-open: a value of exactly 0.85
 * lands in `auto`, exactly 0.60 lands in `confirm`. See
 * `confidence-tier.test.ts` for boundary cases.
 *
 * The function is a pure operation on the confidence number — it does
 * not branch on lookup state, locale, or any other context. Higher
 * layers (the Server Action for the lookup gate; the result UI for
 * presentation) call it and switch on the returned tier.
 *
 * Calibration note: the empirical median confidence on well-lit mobile
 * photos during the 2026-06-10 live testing session was ~0.72, so the
 * dominant tier in production today is `confirm`. The thresholds are
 * the PRD's v1 values; tuning them against the eval harness (#110) is
 * follow-up work.
 */
export type ConfidenceTier = 'auto' | 'confirm' | 'retry'

export const CONFIDENCE_AUTO_THRESHOLD = 0.85
export const CONFIDENCE_CONFIRM_THRESHOLD = 0.6

export function resolveConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= CONFIDENCE_AUTO_THRESHOLD) return 'auto'
  if (confidence >= CONFIDENCE_CONFIRM_THRESHOLD) return 'confirm'
  return 'retry'
}
