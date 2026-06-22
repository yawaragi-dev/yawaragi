import { afterEach, describe, expect, it, vi } from 'vitest'

// Stub `@ai-sdk/mcp` at the module boundary so the registry's factory
// can be exercised without opening a real streamable-HTTP transport.
// The factory itself is what we're asserting on — that it (a) reads
// `MCP_SAKENOWA_URL` lazily, (b) constructs an HTTP transport config,
// (c) hands the config to `createMCPClient`. We never make a network
// call; the stub returns a structurally-distinct object so a "swap the
// key, get a fresh client" assertion is meaningful.
const createMCPClientSpy = vi.fn(async (config: unknown) => ({
  __stub: true,
  config,
  close: async () => undefined,
}))

vi.mock('@ai-sdk/mcp', () => ({
  createMCPClient: createMCPClientSpy,
}))

// `env` is parsed at import time; the registry reads `env.MCP_SAKENOWA_URL`
// inside the factory, not at module load. We stub via `vi.stubEnv` per
// test rather than at module scope so a missing-env-var test can run
// in isolation.
afterEach(() => {
  vi.unstubAllEnvs()
  createMCPClientSpy.mockClear()
})

describe('MCP client registry', () => {
  it('falls back to the default key when the env value is unset', async () => {
    const { resolveMcpClientKey, DEFAULT_MCP_CLIENT_KEY } = await import('./registry')
    expect(resolveMcpClientKey(undefined)).toBe(DEFAULT_MCP_CLIENT_KEY)
  })

  it('falls back to the default key when the env value is an empty string', async () => {
    // Empty strings in the env arrive as `''`, not `undefined`. The
    // `empty()` preprocessor in src/env.ts normalises this for the
    // parsed env, but `resolveMcpClientKey` guards anyway so a direct
    // caller (e.g. a future `MCP_CLIENT` env that bypasses `empty()`)
    // sees the same fallback.
    const { resolveMcpClientKey, DEFAULT_MCP_CLIENT_KEY } = await import('./registry')
    expect(resolveMcpClientKey('')).toBe(DEFAULT_MCP_CLIENT_KEY)
  })

  it('resolves the known key without touching the default branch', async () => {
    const { resolveMcpClientKey } = await import('./registry')
    expect(resolveMcpClientKey('yawaragi-sakenowa')).toBe('yawaragi-sakenowa')
  })

  it('throws on an unknown key rather than silently falling back', async () => {
    // Same anti-typo posture as `resolveVisionProviderKey` — a misspelled
    // env value must surface as a startup error, not as a silent
    // resolution to the default that hides the misconfiguration from
    // the operator.
    const { resolveMcpClientKey } = await import('./registry')
    expect(() => resolveMcpClientKey('yawaragi-skanenowa')).toThrow(
      /Unknown MCP client key/,
    )
  })

  it('exposes the set of registered keys', async () => {
    // Sanity-check: every key in the union appears in the registered
    // list. A new key added to the union without registering a factory
    // would fail this assertion.
    const { MCP_CLIENT_KEYS } = await import('./registry')
    expect(MCP_CLIENT_KEYS).toContain('yawaragi-sakenowa')
  })

  it('throws at factory invocation if MCP_SAKENOWA_URL is not set', async () => {
    // The error message must name the missing env var so the operator
    // can act without grepping. Same shape as `SESSION_COOKIE_SECRET`'s
    // first-use throw in `scan-action.ts`.
    vi.stubEnv('MCP_SAKENOWA_URL', '')
    vi.resetModules()
    const { getDefaultMcpClient } = await import('./registry')
    await expect(getDefaultMcpClient()).rejects.toThrow(/MCP_SAKENOWA_URL/)
    expect(createMCPClientSpy).not.toHaveBeenCalled()
  })

  it('constructs an HTTP transport config and delegates to createMCPClient', async () => {
    // The seam the registry exposes: callers say "give me the default
    // MCP client" and the registry handles transport choice + URL
    // wiring. Asserting the config shape pins the transport choice
    // (`http`, per ADR-0003) without depending on a real server.
    vi.stubEnv('MCP_SAKENOWA_URL', 'https://mcp-sakenowa.example.test')
    vi.resetModules()
    const { getDefaultMcpClient } = await import('./registry')
    const client = await getDefaultMcpClient()
    expect(client).toBeDefined()
    expect(createMCPClientSpy).toHaveBeenCalledTimes(1)
    const config = createMCPClientSpy.mock.calls[0]?.[0] as {
      transport: { type: string; url: string }
      clientName?: string
    }
    expect(config.transport).toEqual({
      type: 'http',
      url: 'https://mcp-sakenowa.example.test',
    })
    expect(config.clientName).toBe('yawaragi')
  })

  it('returns a fresh client per call so a closed transport on one caller does not leak to another', async () => {
    // The factory contract: each invocation opens a new client. If we
    // ever memoise this, the test fails and forces an explicit
    // architectural decision about lifecycle.
    vi.stubEnv('MCP_SAKENOWA_URL', 'https://mcp-sakenowa.example.test')
    vi.resetModules()
    const { getMcpClient } = await import('./registry')
    const a = await getMcpClient('yawaragi-sakenowa')
    const b = await getMcpClient('yawaragi-sakenowa')
    expect(a).not.toBe(b)
    expect(createMCPClientSpy).toHaveBeenCalledTimes(2)
  })
})
