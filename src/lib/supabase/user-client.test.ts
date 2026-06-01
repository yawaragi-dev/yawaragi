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
  it('throws a clear error when the Clerk session has no JWT', async () => {
    mockAuth.mockResolvedValue({ getToken: async () => null })
    const { getUserScopedClient } = await import('./user-client')

    await expect(getUserScopedClient()).rejects.toThrow(
      /signed in|authenticated/i,
    )
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it('forwards the Clerk JWT as a Supabase Authorization header', async () => {
    mockAuth.mockResolvedValue({ getToken: async () => 'clerk.jwt.token' })
    const sentinel = { from: () => null }
    mockCreateClient.mockReturnValue(sentinel)
    const { getUserScopedClient } = await import('./user-client')

    const client = await getUserScopedClient()

    expect(client).toBe(sentinel)
    expect(mockCreateClient).toHaveBeenCalledTimes(1)
    const [url, key, options] = mockCreateClient.mock.calls[0]
    expect(url).toBe('https://test.supabase.co')
    expect(key).toBe('anon-key')
    expect(options.global.headers.Authorization).toBe('Bearer clerk.jwt.token')
    expect(options.auth.persistSession).toBe(false)
    expect(options.auth.autoRefreshToken).toBe(false)
  })

  it('asks Clerk for the "supabase" JWT template (matches Supabase Third-Party Auth wiring)', async () => {
    const getToken = vi.fn(async () => 'token')
    mockAuth.mockResolvedValue({ getToken })
    mockCreateClient.mockReturnValue({})
    const { getUserScopedClient } = await import('./user-client')

    await getUserScopedClient()

    expect(getToken).toHaveBeenCalledWith({ template: 'supabase' })
  })
})
