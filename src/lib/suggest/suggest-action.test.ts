import { afterEach, describe, expect, it, vi } from 'vitest'

// The Playwright specs against a stubbed dev server (see
// `e2e/suggest-page.spec.ts`) exercise the RSC render path for each
// discriminated-union state. The tests here lock down the SERVER-SIDE
// contract of the action:
//
//   - input validation short-circuits before I/O
//   - MCP transport failure surfaces as `service_unavailable`, not a throw
//
// The Langfuse-traced happy path with a real tool loop is exercised on
// preview deploy (the maintainer step in the PR body), because AI SDK 7's
// `stopWhen: isStepCount(6)` tool-loop shape needs a full LanguageModelV3
// that responds to tool calls with tool results — which the
// `MockLanguageModelV3` from `ai/test` requires substantial per-call
// scripting to simulate, and the exercise wouldn't tell us anything the
// underlying AI SDK's own tests don't.

// The meter — debug log, rate limit before the tool loop, the bypass — is
// tested once in `metered-call.test.ts`. Here it admits or refuses as each
// test says, and records whether the action reached it at all.
vi.mock('@/lib/metering/metered-call', () => import('@/lib/metering/fake-metered-call'))

vi.mock('@/lib/ai/mcp/registry', () => ({
  getDefaultMcpClient: vi.fn(),
}))

import { getDefaultMcpClient } from '@/lib/ai/mcp/registry'
import { fakeMeter, resetFakeMeter } from '@/lib/metering/fake-metered-call'
import { suggestAction } from './suggest-action'
import { MAX_FREEFORM_QUERY_LEN } from './suggest-action-state'

const getDefaultMcpClientMock = vi.mocked(getDefaultMcpClient)

afterEach(() => {
  resetFakeMeter()
  vi.clearAllMocks()
})

describe('suggestAction — input validation', () => {
  it('rejects a negative brandId before hitting any downstream I/O', async () => {
    const state = await suggestAction({ kind: 'brand', brandId: -1 })
    expect(state).toEqual({ status: 'invalid_input', reason: 'malformed_seed' })
    // Never reached the meter: no cookie read, no debug log, no rate limit.
    expect(fakeMeter.calls).toEqual([])
  })

  it('rejects a zero brandId', async () => {
    const state = await suggestAction({ kind: 'brand', brandId: 0 })
    expect(state).toEqual({ status: 'invalid_input', reason: 'malformed_seed' })
  })

  it('rejects a non-integer brandId', async () => {
    const state = await suggestAction({ kind: 'brand', brandId: 1.5 })
    expect(state).toEqual({ status: 'invalid_input', reason: 'malformed_seed' })
  })

  // Freeform (S6, #144) validation — the same fast-fail invariant as
  // brand-mode. Malformed freeform input never reaches the meter (cookies,
  // the rate limit) or the MCP client.
  it('rejects an empty freeform query before hitting any downstream I/O', async () => {
    const state = await suggestAction({ kind: 'freeform', query: '' })
    expect(state).toEqual({ status: 'invalid_input', reason: 'empty_query' })
    expect(fakeMeter.calls).toEqual([])
  })

  it('rejects a whitespace-only freeform query as empty', async () => {
    // The action trims before checking length so `   \t  \n  ` reads as
    // empty. Client-side normalisation should have matched but the action
    // is the authoritative boundary.
    const state = await suggestAction({ kind: 'freeform', query: '   \t\n  ' })
    expect(state).toEqual({ status: 'invalid_input', reason: 'empty_query' })
  })

  it('rejects an over-length freeform query', async () => {
    // MAX_FREEFORM_QUERY_LEN caps the tokens the LLM ever sees. A visitor
    // pasting a paragraph gets a fast rejection, not a burned Anthropic
    // credit. Length is measured after trim so trailing whitespace can't
    // be gamed to push under the cap.
    const longQuery = 'x'.repeat(MAX_FREEFORM_QUERY_LEN + 1)
    const state = await suggestAction({ kind: 'freeform', query: longQuery })
    expect(state).toEqual({ status: 'invalid_input', reason: 'query_too_long' })
  })

  it('rejects an unknown seed kind (defensive against future widening)', async () => {
    // The public server surface catches an untyped caller passing e.g.
    // `{ kind: 'text' }` from a stale client build after the schema
    // rolls. Same posture as the exhaustiveness check in
    // `buildSeedPrompt` — belt-and-suspenders defence.
    const state = await suggestAction({
      // Bypass TS to simulate the runtime-only case.
      kind: 'unknown-future-kind',
      brandId: 42,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    expect(state).toEqual({ status: 'invalid_input', reason: 'malformed_seed' })
  })
})

describe('suggestAction — the suggestions budget', () => {
  it('returns session_missing without opening MCP when the request has no session cookie', async () => {
    fakeMeter.next = { status: 'session_missing' }

    const state = await suggestAction({ kind: 'brand', brandId: 42 })
    expect(state).toEqual({ status: 'session_missing' })
    // The MCP client factory is never reached — session_missing
    // short-circuits before the tool loop.
    expect(getDefaultMcpClientMock).not.toHaveBeenCalled()
  })

  it('returns rate_limited without opening MCP once the budget is spent', async () => {
    fakeMeter.next = { status: 'rate_limited', retryAfterSec: 3600 }

    const state = await suggestAction({ kind: 'freeform', query: 'like a peaty whisky' })
    expect(state).toEqual({ status: 'rate_limited', retryAfterSec: 3600 })
    expect(getDefaultMcpClientMock).not.toHaveBeenCalled()
  })

  it('spends the suggestions budget, shared by brand and freeform seeds', async () => {
    getDefaultMcpClientMock.mockRejectedValue(new Error('MCP_SAKENOWA_URL is not set …'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await suggestAction({ kind: 'brand', brandId: 42 })
    await suggestAction({ kind: 'freeform', query: 'like a peaty whisky' })

    expect(fakeMeter.calls.map((c) => [c.bucket, c.paid])).toEqual([
      ['suggestions', true],
      ['suggestions', true],
    ])
  })

  it('answers from the e2e stub cookie without spending the budget', async () => {
    fakeMeter.cookies = { yawaragi_suggest_stub: 'no_match' }

    const state = await suggestAction({ kind: 'brand', brandId: 42 })

    expect(state.status).not.toBe('rate_limited')
    expect(fakeMeter.calls[0]?.paid).toBe(false)
    expect(getDefaultMcpClientMock).not.toHaveBeenCalled()
  })
})

describe('suggestAction — MCP service unavailable', () => {
  it('returns service_unavailable when the MCP client factory throws (env unset)', async () => {
    getDefaultMcpClientMock.mockRejectedValueOnce(
      new Error('MCP_SAKENOWA_URL is not set. Set it to the deployed …'),
    )

    const state = await suggestAction({ kind: 'brand', brandId: 42 })
    expect(state).toEqual({ status: 'service_unavailable' })
  })

  it('returns service_unavailable when the transport is reachable but tools() fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    getDefaultMcpClientMock.mockResolvedValueOnce({
      tools: vi.fn().mockRejectedValue(new Error('handshake failed')),
      close,
      serverInfo: { name: 'test', version: '0.0.0' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const state = await suggestAction({ kind: 'brand', brandId: 42 })
    expect(state).toEqual({ status: 'service_unavailable' })
    // finally-block runs even on the tools()-failure short-return.
    expect(close).toHaveBeenCalled()
  })
})

describe('suggestAction — debug log', () => {
  it('attaches a debugLog with entered / MCP failure events when debug cookie is set', async () => {
    // Debug is opt-in per visitor via the `yawaragi_debug=1` cookie. When
    // set, the action creates a `DebugLog` and every `debugAdd(...)` call
    // in the request appends to it. The log is serialised onto the
    // action's state so the `<DebugLogPusher />` client island can push
    // it into the panel store. The meter opens the log; the fake does so
    // when `fakeMeter.debug` is set, as the real one does for the cookie.
    fakeMeter.debug = true
    // Force the MCP path to fail so we exercise a full run through
    // several debugAdd points (entered → MCP opening → MCP client open
    // failed → service_unavailable).
    getDefaultMcpClientMock.mockRejectedValueOnce(
      new Error('MCP_SAKENOWA_URL is not set …'),
    )

    const state = await suggestAction({ kind: 'brand', brandId: 42 })

    expect(state.status).toBe('service_unavailable')
    expect(state.debugLog).toBeDefined()
    const events = state.debugLog ?? []
    // Sanity: the log covers the critical entry-through-failure path.
    // We don't pin the exact copy, just the source + a substring, so
    // future wording tweaks don't churn the test.
    expect(events.some((e) => e.source === 'SuggestAction' && e.message.includes('entered'))).toBe(true)
    expect(events.some((e) => e.source === 'MCP' && e.message.includes('opening'))).toBe(true)
    expect(events.some((e) => e.source === 'MCP' && e.level === 'error')).toBe(true)
  })

  it('omits debugLog entirely when the debug cookie is absent', async () => {
    // The absence-of-cookie path is the 99.99% case and MUST NOT allocate
    // an accumulator. Absence of the debugLog field (not `[]`) is the
    // signal to the client bridge to skip its store push entirely.
    getDefaultMcpClientMock.mockRejectedValueOnce(
      new Error('MCP_SAKENOWA_URL is not set …'),
    )

    const state = await suggestAction({ kind: 'brand', brandId: 42 })

    expect(state.status).toBe('service_unavailable')
    expect(state.debugLog).toBeUndefined()
  })

  it('does not attach a debugLog to an invalid_input fast-fail response', async () => {
    // The input-validation branch runs BEFORE cookies() is read (fast-
    // fail invariant asserted by the input-validation tests above). So
    // even if a debug cookie is set, malformed input responses carry no
    // debugLog. The trade-off is intentional — debug value on a
    // syntactically-invalid input is thin.
    fakeMeter.debug = true

    const state = await suggestAction({ kind: 'brand', brandId: -1 })

    expect(state.status).toBe('invalid_input')
    expect(state.debugLog).toBeUndefined()
  })
})
