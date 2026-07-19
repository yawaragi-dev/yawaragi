import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAuth = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}))

beforeEach(() => {
  mockAuth.mockReset()
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('@/env')
})

// The allowlist is parsed once at module load from env, so each test sets the
// env mock and re-imports the module fresh (via resetModules) to exercise a
// given allowlist.
async function loadWithAllowlist(value: string | undefined) {
  vi.doMock('@/env', () => ({ env: { MAINTAINER_USER_IDS: value } }))
  return import('./maintainer')
}

describe('currentUserIsMaintainer', () => {
  it('is true when the authenticated user id is on the allowlist', async () => {
    const { currentUserIsMaintainer } = await loadWithAllowlist('user_admin, user_second')
    mockAuth.mockResolvedValue({ userId: 'user_admin' })
    expect(await currentUserIsMaintainer()).toBe(true)
  })

  it('is false when the authenticated user is not on the allowlist', async () => {
    const { currentUserIsMaintainer } = await loadWithAllowlist('user_admin')
    mockAuth.mockResolvedValue({ userId: 'user_stranger' })
    expect(await currentUserIsMaintainer()).toBe(false)
  })

  it('is false for an anonymous / signed-out request', async () => {
    const { currentUserIsMaintainer } = await loadWithAllowlist('user_admin')
    mockAuth.mockResolvedValue({ userId: null })
    expect(await currentUserIsMaintainer()).toBe(false)
  })

  it('fails closed when MAINTAINER_USER_IDS is unset, even for a signed-in user', async () => {
    const { currentUserIsMaintainer } = await loadWithAllowlist(undefined)
    mockAuth.mockResolvedValue({ userId: 'user_admin' })
    expect(await currentUserIsMaintainer()).toBe(false)
  })
})
