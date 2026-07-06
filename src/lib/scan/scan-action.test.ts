import { afterEach, describe, expect, it, vi } from 'vitest'

// The scan surface's end-to-end tier-1/tier-2 tool-loop and the full
// Sakenowa-lookup chain are exercised on preview via the Playwright
// E2E spec (`e2e/scan.spec.ts` with `VISION_PROVIDER=e2e-stub`). This
// file locks down the SERVER-SIDE action-boundary contract that Vitest
// can observe cheaply — specifically the round-4 `RATE_LIMIT_BYPASS=1`
// escape hatch, which is covered at the config-gate level in
// `src/lib/rate-limit/config-gate.test.ts` but NOT at the action-
// boundary where the actual `if (env.RATE_LIMIT_BYPASS === '1') …`
// short-circuit lives.
//
// Same shape as the sibling `src/lib/suggest/suggest-action.test.ts` —
// dev/preview iteration on the scan surface (5/24h bucket) needs the
// same escape hatch, so the same regression insurance.

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))

// This subject transitively imports `@/i18n/navigation → next-intl/navigation
// → next/navigation`. The top-level `next/navigation` stub in `vitest.setup.ts`
// only reaches through that chain because `next-intl` is listed in
// `vitest.config.mts` under `test.server.deps.inline` — without inlining,
// next-intl loads its own copy of `next/navigation` from its own
// `node_modules` and Vite's transformer never sees `vi.mock('next/navigation')`.
// See `docs/agents/vitest-mocks.md` for the full rationale and the
// symbols we must keep on the stub.

vi.mock('@/lib/ai/vision/registry', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/ai/vision/registry')
  >('@/lib/ai/vision/registry')
  return {
    ...actual,
    getVisionProvider: vi.fn(),
  }
})

vi.mock('@/lib/rate-limit/config-gate', () => ({
  // Return null so the action skips rate-limit enforcement (as if env
  // is unset in non-production). Same trick as the suggest-action test
  // suite. Only relevant if the bypass DIDN'T fire — the test asserts
  // this mock stays uncalled when it did.
  assertRateLimitConfig: vi.fn().mockReturnValue(null),
}))

describe('scanAction — RATE_LIMIT_BYPASS escape hatch', () => {
  // The bypass is a top-of-function short-circuit inside `enforceRateLimit`
  // (see scan-action.ts § "Dev/preview escape hatch"). It's covered at
  // the env-parse and prod-guard layers by config-gate.test.ts, but the
  // action-boundary behaviour — that the bypass fires BEFORE
  // assertRateLimitConfig / the cookie read / the KV round-trip — is
  // only observable here. Regression insurance for the "someone
  // refactors enforceRateLimit and moves the guard below the config
  // gate" future.
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('short-circuits enforceRateLimit before touching config-gate when RATE_LIMIT_BYPASS=1', async () => {
    // Env must be set BEFORE we resetModules + dynamic-import, because
    // `env` is parsed at module load in src/env.ts (Zod .parse on
    // process.env). Same stubEnv + reset + dynamic-import shape as
    // `src/lib/ai/mcp/registry.test.ts`'s missing-env-var test.
    vi.stubEnv('RATE_LIMIT_BYPASS', '1')
    vi.resetModules()

    const { scanAction } = await import('./scan-action')
    const { INITIAL_SCAN_ACTION_STATE } = await import('./scan-action-state')
    const { getVisionProvider } = await import('@/lib/ai/vision/registry')
    const { assertRateLimitConfig } = await import(
      '@/lib/rate-limit/config-gate'
    )
    const { cookies } = await import('next/headers')

    const getVisionProviderMock = vi.mocked(getVisionProvider)
    const assertRateLimitConfigMock = vi.mocked(assertRateLimitConfig)
    const cookiesMock = vi.mocked(cookies)

    // Fresh call-history so `not.toHaveBeenCalled()` asserts THIS test's
    // behaviour, not accumulation across the file's module lifetime.
    assertRateLimitConfigMock.mockClear()

    // Cookie jar reachable for the up-front debug-cookie read (line
    // ~247 of scan-action.ts). No debug cookie set — the DebugLog
    // stays undefined and every downstream `debugAdd` is a no-op.
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    // Reach through the bypass to the vision provider → throw there.
    // That the code reaches extractLabel is the PROOF the bypass fired:
    // if it hadn't, the action would return `session_missing` (since
    // assertRateLimitConfig returns null and the cookie is empty) or
    // `rate_limited`, never touching the vision provider.
    getVisionProviderMock.mockReturnValue({
      extractLabel: vi
        .fn()
        .mockRejectedValue(new Error('bypass-fired — vision provider reached')),
    })

    // Swallow + assert the warn — the guard emits `console.warn` on
    // every bypass firing so an operator tailing logs sees a clear
    // "you have an escape hatch active" line.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Minimal FormData with a non-empty JPEG blob and a valid locale.
    // The blob just needs `size > 0` for the invalid_input check to
    // pass — the mocked extractLabel throws before the bytes matter.
    const formData = new FormData()
    formData.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    formData.set('locale', 'en')

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, formData)

    // extraction_failed proves the code reached the vision provider
    // (past the rate-limit gate). rate_limited or session_missing
    // would prove the bypass DIDN'T fire.
    expect(state.status).toBe('extraction_failed')
    // The bypass short-circuits BEFORE assertRateLimitConfig runs —
    // the whole point of the escape hatch is to skip the config check
    // entirely so dev iteration works without KV credentials.
    expect(assertRateLimitConfigMock).not.toHaveBeenCalled()
    // The warn line makes the escape hatch observable in local /
    // preview logs. `'[scan]'` prefix distinguishes it from the
    // sibling suggest-action's `'[suggest]'` warn.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/RATE_LIMIT_BYPASS/))

    warnSpy.mockRestore()
  })
})
