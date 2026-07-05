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
// preview deploy (the maintainer step in the PR body), because AI SDK 6's
// `stopWhen: stepCountIs(6)` tool-loop shape needs a full LanguageModelV3
// that responds to tool calls with tool results — which the
// `MockLanguageModelV3` from `ai/test` requires substantial per-call
// scripting to simulate, and the exercise wouldn't tell us anything the
// underlying AI SDK's own tests don't.

vi.mock('next/headers', () => ({
  // For the invalid_input tests these mocks must fail loudly if reached
  // (proving the branch short-circuited); for the service_unavailable
  // test they must be reachable. We make them fail by default and
  // override per-test.
  cookies: vi.fn(),
  headers: vi.fn(),
}))

vi.mock('@/lib/ai/mcp/registry', () => ({
  getDefaultMcpClient: vi.fn(),
}))

vi.mock('@/lib/rate-limit/config-gate', () => ({
  // Return null so the action skips rate-limit enforcement (as if env is
  // unset in non-production). The scan-action test suite uses the same
  // trick.
  assertRateLimitConfig: vi.fn().mockReturnValue(null),
}))

import { cookies, headers } from 'next/headers'
import { getDefaultMcpClient } from '@/lib/ai/mcp/registry'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { suggestAction } from './suggest-action'
import { MAX_FREEFORM_QUERY_LEN } from './suggest-action-state'

const cookiesMock = vi.mocked(cookies)
const headersMock = vi.mocked(headers)
const getDefaultMcpClientMock = vi.mocked(getDefaultMcpClient)
const assertRateLimitConfigMock = vi.mocked(assertRateLimitConfig)

describe('suggestAction — input validation', () => {
  it('rejects a negative brandId before hitting any downstream I/O', async () => {
    // If cookies() is reached, the mock returns undefined and any await
    // .get(...) crashes — that's the loud failure we want.
    cookiesMock.mockRejectedValue(
      new Error('cookies() called — the invalid_input branch should return before this'),
    )
    headersMock.mockRejectedValue(
      new Error('headers() called — the invalid_input branch should return before this'),
    )

    const state = await suggestAction({ kind: 'brand', brandId: -1 })
    expect(state).toEqual({ status: 'invalid_input', reason: 'malformed_seed' })
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
  // brand-mode. Malformed freeform input never reaches cookies() /
  // headers() / the MCP client.
  it('rejects an empty freeform query before hitting any downstream I/O', async () => {
    cookiesMock.mockRejectedValue(
      new Error('cookies() called — the invalid_input branch should return before this'),
    )
    headersMock.mockRejectedValue(
      new Error('headers() called — the invalid_input branch should return before this'),
    )
    const state = await suggestAction({ kind: 'freeform', query: '' })
    expect(state).toEqual({ status: 'invalid_input', reason: 'empty_query' })
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

describe('suggestAction — session_missing (post-#161 middleware refactor)', () => {
  it('returns session_missing when the anonymous-session cookie is absent and rate-limit env is fully configured', async () => {
    // Simulate a fully-configured rate-limit env — the config-gate returns
    // a real config bundle. The action then tries to read the cookie and
    // hits the empty jar; the read-only refactor surfaces that as a
    // typed state instead of throwing or writing a fresh cookie.
    assertRateLimitConfigMock.mockReturnValueOnce({
      secret: 'test-secret-32-characters-minimum',
      salt: 'test-salt-16chars',
      kvUrl: 'https://kv.example.test',
      kvToken: 'test-token',
    })
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)

    const state = await suggestAction({ kind: 'brand', brandId: 42 })
    expect(state).toEqual({ status: 'session_missing' })
    // The MCP client factory is never reached — session_missing
    // short-circuits before the tool loop.
    expect(getDefaultMcpClientMock).not.toHaveBeenCalled()
  })
})

describe('suggestAction — MCP service unavailable', () => {
  it('returns service_unavailable when the MCP client factory throws (env unset)', async () => {
    // Empty jar so the stub cookie / age-gate cookie don't interfere.
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      set: () => undefined,
      // Minimal cookie-jar shape sufficient for the action's use.
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)

    getDefaultMcpClientMock.mockRejectedValueOnce(
      new Error('MCP_SAKENOWA_URL is not set. Set it to the deployed …'),
    )

    const state = await suggestAction({ kind: 'brand', brandId: 42 })
    expect(state).toEqual({ status: 'service_unavailable' })
  })

  it('returns service_unavailable when the transport is reachable but tools() fails', async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      set: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)

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
    // it into the panel store.
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === 'yawaragi_debug' ? { name, value: '1' } : undefined,
      set: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)
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
    cookiesMock.mockResolvedValue({
      get: () => undefined,
      set: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)
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
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === 'yawaragi_debug' ? { name, value: '1' } : undefined,
      set: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    const state = await suggestAction({ kind: 'brand', brandId: -1 })

    expect(state.status).toBe('invalid_input')
    expect(state.debugLog).toBeUndefined()
  })
})

describe('suggestAction — RATE_LIMIT_BYPASS escape hatch', () => {
  // The bypass is a top-of-function short-circuit inside `enforceRateLimit`
  // (see suggest-action.ts § "Dev/preview escape hatch"). It's exercised
  // by env.ts + config-gate.ts unit tests at the parse and prod-guard
  // layers, but the action-boundary behaviour — that the bypass fires
  // BEFORE assertRateLimitConfig / the cookie read / the KV round-trip
  // — is only observable here. Regression insurance for the "someone
  // refactors enforceRateLimit and moves the guard below the config
  // gate" future.
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('short-circuits enforceRateLimit before touching config-gate when RATE_LIMIT_BYPASS=1', async () => {
    // Env has to be set BEFORE we resetModules + dynamic-import, because
    // `env` is parsed at module load in src/env.ts (Zod .parse on
    // process.env). Same shape as registry.test.ts's stubEnv + reset
    // + dynamic import pattern.
    vi.stubEnv('RATE_LIMIT_BYPASS', '1')
    vi.resetModules()

    // Re-import the module graph AFTER reset so the fresh `env` binding
    // carries RATE_LIMIT_BYPASS='1'. The captured `getDefaultMcpClient`
    // / `assertRateLimitConfig` / `cookies` handles at the top of this
    // file point at the pre-reset module instances; we need the fresh
    // ones to attach per-test behaviour that the freshly-imported
    // suggest-action will actually see.
    const { suggestAction: freshSuggestAction } = await import('./suggest-action')
    const { getDefaultMcpClient: freshGetMcp } = await import('@/lib/ai/mcp/registry')
    const { assertRateLimitConfig: freshAssertConfig } = await import(
      '@/lib/rate-limit/config-gate'
    )
    const { cookies: freshCookies } = await import('next/headers')

    const freshGetMcpMock = vi.mocked(freshGetMcp)
    const freshAssertConfigMock = vi.mocked(freshAssertConfig)
    const freshCookiesMock = vi.mocked(freshCookies)

    // Prior tests in this file already exercised assertRateLimitConfig
    // through the same file-top vi.mock factory (5 calls at time of
    // writing). Reset the call history so `not.toHaveBeenCalled()`
    // asserts THIS test's behaviour, not cumulative history.
    freshAssertConfigMock.mockClear()

    // Cookie jar reachable for the up-front debug-cookie read (line ~74
    // of suggest-action.ts). No debug cookie set, so the DebugLog stays
    // undefined and every downstream `debugAdd` is a no-op.
    freshCookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    // Reach through the bypass to MCP → fail there. This is the PROOF
    // that the bypass fired: if the bypass had NOT fired, the action
    // would return `session_missing` (since assertRateLimitConfig
    // returns null by default and the cookie is empty), never touching
    // getDefaultMcpClient.
    freshGetMcpMock.mockRejectedValueOnce(
      new Error('MCP_SAKENOWA_URL is not set …'),
    )

    // Swallow the warn while asserting it fired — the guard emits a
    // console.warn on every bypass firing so an operator tailing logs
    // sees a clear "you have an escape hatch active" line.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const state = await freshSuggestAction({ kind: 'brand', brandId: 42 })

    // service_unavailable proves the code reached MCP (past the rate-
    // limit gate). rate_limited or session_missing would prove the
    // bypass DIDN'T fire.
    expect(state.status).toBe('service_unavailable')
    // The bypass short-circuits BEFORE assertRateLimitConfig is called
    // — the whole point of the escape hatch is to skip the config
    // check entirely so dev iteration works without KV credentials.
    expect(freshAssertConfigMock).not.toHaveBeenCalled()
    // The warn line makes the escape hatch observable in local /
    // preview logs — an operator scanning output should see it and
    // remember to unset the var before shipping.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/RATE_LIMIT_BYPASS/))

    warnSpy.mockRestore()
  })
})
