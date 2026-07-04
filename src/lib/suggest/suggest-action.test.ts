import { describe, expect, it, vi } from 'vitest'

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
