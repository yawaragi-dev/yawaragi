import { describe, expect, it } from 'vitest'
import type { Suggestion } from '@/lib/schemas/suggestion'
import { classifySuggestOutcome } from '@/lib/suggest/suggest-outcome'

/** One suggestion is enough — only the list LENGTH is classified. */
const someSuggestions = [{} as Suggestion, {} as Suggestion]

describe('classifySuggestOutcome', () => {
  it('flags an empty result list as a WARNING, not a success', () => {
    // THE test of this module. #270 shipped a tool loop that completed
    // cleanly and returned nothing for about a month, and every per-call
    // span looked healthy throughout. If this ever silently becomes
    // DEFAULT, the signal is gone and the next #270 is invisible again.
    const outcome = classifySuggestOutcome({ status: 'ok', suggestions: [] })

    expect(outcome.outcome).toBe('no_match')
    expect(outcome.level).toBe('WARNING')
    expect(outcome.metadata).toMatchObject({ 'suggestions.count': 0 })
  })

  it('treats a populated result list as a plain success, with its size', () => {
    const outcome = classifySuggestOutcome({ status: 'ok', suggestions: someSuggestions })

    expect(outcome.outcome).toBe('ok')
    expect(outcome.level).toBeUndefined()
    expect(outcome.metadata).toMatchObject({ 'suggestions.count': 2 })
  })

  it('surfaces the specific failure reason rather than a generic error', () => {
    // `step_budget_exhausted` is the #270 signature; lumping every error
    // together would make it indistinguishable from a parse failure.
    const outcome = classifySuggestOutcome({
      status: 'error',
      reason: 'step_budget_exhausted',
    })

    expect(outcome.outcome).toBe('step_budget_exhausted')
    expect(outcome.level).toBe('ERROR')
  })

  it('keeps the reason on invalid input so bad callers are distinguishable', () => {
    const outcome = classifySuggestOutcome({
      status: 'invalid_input',
      reason: 'query_too_long',
    })

    expect(outcome.outcome).toBe('invalid_input.query_too_long')
  })

  it('does not raise the alarm for an ordinary rate-limit', () => {
    // A metered visitor hitting their cap is the system working. Paging
    // on it would train everyone to ignore the alerts.
    const outcome = classifySuggestOutcome({ status: 'rate_limited', retryAfterSec: 3600 })

    expect(outcome.outcome).toBe('rate_limited')
    expect(outcome.level).toBe('DEFAULT')
  })

  it('treats an unreachable MCP transport as an error', () => {
    const outcome = classifySuggestOutcome({ status: 'service_unavailable' })

    expect(outcome.level).toBe('ERROR')
  })

  it('labels a status it does not recognise instead of dropping it', () => {
    // The whole point of classifying at the boundary: a return path added
    // without updating the switch must still show up in Langfuse.
    const outcome = classifySuggestOutcome({
      status: 'something_new',
    } as unknown as Parameters<typeof classifySuggestOutcome>[0])

    expect(outcome.outcome).toBe('unclassified')
    expect(outcome.level).toBe('WARNING')
  })
})
