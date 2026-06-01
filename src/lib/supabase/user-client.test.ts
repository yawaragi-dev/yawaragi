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

  it('returns null from the accessToken callback when the caller is anonymous', async () => {
    mockCreateClient.mockReturnValue({})
    mockAuth.mockResolvedValue({ getToken: async () => null })
    const { getUserScopedClient } = await import('./user-client')

    getUserScopedClient()

    const [, , options] = mockCreateClient.mock.calls[0]
    const token = await options.accessToken()
    expect(token).toBeNull()
  })
})
