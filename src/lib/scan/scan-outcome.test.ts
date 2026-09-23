import { describe, expect, it } from 'vitest'
import { classifyScanOutcome } from '@/lib/scan/scan-outcome'
import type { ScanActionState } from '@/lib/scan/scan-action-state'

/** Only `status` is classified, so the rest of each state is irrelevant. */
const state = (status: string) => ({ status }) as unknown as ScanActionState

describe('classifyScanOutcome', () => {
  it('records a clean match as an unremarkable success', () => {
    const outcome = classifyScanOutcome(state('matched'))

    expect(outcome.outcome).toBe('matched')
    expect(outcome.level).toBeUndefined()
  })

  it('treats a blurry or unknown bottle as a WARNING, not an error', () => {
    // The visitor got an honest answer; the pipeline did its job. These are
    // worth watching as a RATE — a sudden climb means something changed in
    // the model or the corpus — but they are not failures to page on.
    for (const status of ['no_match', 'low_confidence']) {
      const outcome = classifyScanOutcome(state(status))

      expect(outcome.outcome).toBe(status)
      expect(outcome.level).toBe('WARNING')
    }
  })

  it('treats an unusable extraction as an ERROR, because the retry already ran', () => {
    // `extraction_failed` survives the tier-2 Sonnet retry, so it is a
    // pipeline failure rather than a property of the photo — the one scan
    // outcome that genuinely warrants attention.
    const outcome = classifyScanOutcome(state('extraction_failed'))

    expect(outcome.level).toBe('ERROR')
    expect(outcome.statusMessage).toContain('tier-2')
  })

  it('keeps the partial-match divergences distinguishable from a full match', () => {
    // These drive the tier-2 retry, so they need to stay separable in
    // Langfuse to explain the retry rate.
    for (const status of ['matched_brand_only', 'matched_brewery_only', 'ambiguous']) {
      expect(classifyScanOutcome(state(status)).outcome).toBe(status)
    }
  })

  it('labels a status it does not recognise instead of dropping it', () => {
    const outcome = classifyScanOutcome(state('something_new'))

    expect(outcome.outcome).toBe('unclassified')
    expect(outcome.level).toBe('WARNING')
  })
})
