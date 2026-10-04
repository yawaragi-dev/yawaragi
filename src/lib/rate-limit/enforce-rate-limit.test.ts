import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/env', () => ({
  env: {
    RATE_LIMIT_BYPASS: undefined,
    SESSION_COOKIE_SECRET: 'secret',
    IP_HASH_SALT: 'salt',
    UPSTASH_REDIS_REST_URL: 'https://kv.example',
    UPSTASH_REDIS_REST_TOKEN: 'token',
  },
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}))

vi.mock('@/lib/legal/anonymous-session-cookie', () => ({
  readAnonymousSessionCookie: vi.fn(() => ({ sid: 'session-id-0123456789' })),
}))

vi.mock('@/lib/rate-limit/upstash-kv-client', () => ({
  UpstashKVClient: vi.fn(),
}))

// Every anonymous budget in these tests is spent.
const anonymousRateLimit = vi.fn(async () => ({
  allowed: false,
  remaining: 0,
  retryAfterSec: 3600,
}))
vi.mock('@/lib/rate-limit/anonymous-rate-limit', () => ({
  anonymousRateLimit: (...args: unknown[]) => anonymousRateLimit(...(args as [])),
}))

const currentUserIsMaintainer = vi.fn(async () => false)
vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: () => currentUserIsMaintainer(),
}))

const { enforceRateLimit } = await import('./enforce-rate-limit')

describe('the anonymous rate limit', () => {
  beforeEach(() => {
    anonymousRateLimit.mockClear()
    currentUserIsMaintainer.mockReset()
  })

  it('stops a visitor who has used up their scans', async () => {
    currentUserIsMaintainer.mockResolvedValue(false)
    const decision = await enforceRateLimit({ bucket: 'vision-scan', logPrefix: '[test]' })
    expect(decision.kind).toBe('denied')
  })

  it('lets a signed-in maintainer keep scanning, without spending the anonymous budget', async () => {
    currentUserIsMaintainer.mockResolvedValue(true)
    const decision = await enforceRateLimit({ bucket: 'vision-scan', logPrefix: '[test]' })
    expect(decision.kind).toBe('allowed')
    expect(anonymousRateLimit).not.toHaveBeenCalled()
  })
})
