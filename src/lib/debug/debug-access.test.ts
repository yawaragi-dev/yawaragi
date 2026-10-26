import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockIsMaintainer = vi.fn()

vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: () => mockIsMaintainer(),
}))

beforeEach(() => {
  mockIsMaintainer.mockReset()
  vi.resetModules()
})

afterEach(() => {
  vi.doUnmock('@/env')
})

async function loadOn(vercelEnv: string | undefined) {
  vi.doMock('@/env', () => ({ env: { VERCEL_ENV: vercelEnv } }))
  return import('./debug-access')
}

const withCookie = { get: (name: string) => (name === 'yawaragi_debug' ? { name, value: '1' } : undefined) }
const withoutCookie = { get: () => undefined }

describe('isDebugEnabled', () => {
  it('stays off without the debug cookie, even for a maintainer', async () => {
    const { isDebugEnabled } = await loadOn('production')
    mockIsMaintainer.mockResolvedValue(true)
    expect(await isDebugEnabled(withoutCookie as never)).toBe(false)
  })

  it('turns on for a maintainer with the cookie on Production', async () => {
    const { isDebugEnabled } = await loadOn('production')
    mockIsMaintainer.mockResolvedValue(true)
    expect(await isDebugEnabled(withCookie as never)).toBe(true)
  })

  it('ignores the cookie on Production for anyone who is not a maintainer', async () => {
    const { isDebugEnabled } = await loadOn('production')
    mockIsMaintainer.mockResolvedValue(false)
    expect(await isDebugEnabled(withCookie as never)).toBe(false)
  })

  it.each([['preview'], ['development'], [undefined]])(
    'honours the cookie alone outside Production (%s)',
    async (vercelEnv) => {
      const { isDebugEnabled } = await loadOn(vercelEnv)
      mockIsMaintainer.mockResolvedValue(false)
      expect(await isDebugEnabled(withCookie as never)).toBe(true)
    },
  )
})
