import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuth = vi.fn()
const mockCreateClient = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}))

vi.mock('@/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  },
}))

beforeEach(() => {
  mockAuth.mockReset()
  mockCreateClient.mockReset()
})

describe('getUserScopedClient', () => {
  it('returns a supabase-js client configured against the anon key', async () => {
    const sentinel = { from: () => null }
    mockCreateClient.mockReturnValue(sentinel)
    const { getUserScopedClient } = await import('./user-client')

    const client = getUserScopedClient()

    expect(client).toBe(sentinel)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    const [url, key] = mockCreateClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('anon-key')
  })

  it('passes an accessToken callback that pulls the Clerk session token', async () => {
    mockCreateClient.mockReturnValue({})
    const getToken = vi.fn(async () => 'clerk.jwt.token')
    mockAuth.mockResolvedValue({ getToken })
    const { getUserScopedClient } = await import('./user-client')

    getUserScopedClient()

    const [, , options] = mockCreateClient.mock.calls[0]
    expect(typeof options.accessToken).toBe('function')

    const token = await options.accessToken()
    expect(token).toBe('clerk.jwt.token')
    expect(getToken).toHaveBeenCalledWith()
  })

  it('throws a named error from the accessToken callback when the caller is anonymous', async () => {
    // Loud-failure contract (#219): an unauthenticated caller must NOT silently
    // fall back to the anon key and get an empty result set — that reads as
    // "no data" in dev while being an auth bug on a user-scoped table. The
    // callback throws the moment supabase-js tries to attach auth to the first
    // request, which is exactly when the silent-empty would otherwise mislead.
    mockCreateClient.mockReturnValue({})
    mockAuth.mockResolvedValue({ getToken: async () => null })
    const { getUserScopedClient, UnauthenticatedUserScopeError } = await import('./user-client')

    getUserScopedClient()

    const [, , options] = mockCreateClient.mock.calls[0]
    await expect(options.accessToken()).rejects.toThrow(UnauthenticatedUserScopeError)
  })
})

describe('getAnonScopedClient', () => {
  it('returns a supabase-js client on the anon key with NO accessToken callback (explicit escape hatch)', async () => {
    const sentinel = { from: () => null }
    mockCreateClient.mockReturnValue(sentinel)
    const { getAnonScopedClient } = await import('./user-client')

    const client = getAnonScopedClient()

    expect(client).toBe(sentinel)
    const [url, key, options] = mockCreateClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('anon-key')
    // No Clerk token is attached: this path only ever sees anon-RLS rows.
    expect(options).toBeUndefined()
  })
})
