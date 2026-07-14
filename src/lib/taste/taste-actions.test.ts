import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CROSS_BEVERAGE_MAP } from '@/lib/ai/tools/cross-beverage-data'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

// A mutable holder for the in-memory store, shared with the mocked factory.
// vi.hoisted runs before imports, so the InMemoryTasteEventStore is assigned in
// beforeEach (once the import is available), and the factory reads it lazily.
const h = vi.hoisted(() => ({ store: null as unknown }))

vi.mock('next/headers', () => ({
  // Debug cookie absent → no DebugLog created (keeps assertions on state, not trace).
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))
vi.mock('@/env', () => ({
  env: {
    SESSION_COOKIE_SECRET: 'test-secret',
    UPSTASH_REDIS_REST_URL: 'https://kv',
    UPSTASH_REDIS_REST_TOKEN: 'tok',
    RATE_LIMIT_BYPASS: undefined,
  },
}))
vi.mock('@/lib/rate-limit/enforce-rate-limit', () => ({
  enforceRateLimit: vi.fn(async () => ({ kind: 'allowed', allowed: true, retryAfterSec: 0 })),
}))
vi.mock('@/lib/legal/anonymous-session-cookie', () => ({
  readAnonymousSessionCookie: vi.fn(() => ({ sid: 'test-sid' })),
}))
vi.mock('@/lib/sakenowa/lookup', () => ({
  lookupFlavorChart: vi.fn(),
}))
vi.mock('@/lib/taste/get-taste-event-store', () => ({
  getTasteEventStore: vi.fn(() => h.store),
}))

import { InMemoryTasteEventStore } from '@/lib/taste/in-memory-taste-event-store'
import { enforceRateLimit } from '@/lib/rate-limit/enforce-rate-limit'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import { lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { applyCrossBeverage, applyScanResult, rateSake } from '@/lib/taste/taste-actions'

const CHART: FlavorChart = {
  source: 'sakenowa',
  brandId: 123,
  f1: 1,
  f2: 1,
  f3: 1,
  f4: 1,
  f5: 1,
  f6: 1,
}

beforeEach(() => {
  // Clear call history for all mocks (so `not.toHaveBeenCalled()` is per-test);
  // drop lookupFlavorChart's implementation so each test sets its own.
  vi.clearAllMocks()
  vi.mocked(lookupFlavorChart).mockReset()
  h.store = new InMemoryTasteEventStore()
  vi.mocked(enforceRateLimit).mockResolvedValue({ kind: 'allowed', allowed: true, retryAfterSec: 0 })
  vi.mocked(readAnonymousSessionCookie).mockReturnValue({ sid: 'test-sid' } as never)
})

describe('rateSake', () => {
  it('records a positive rating and returns a profile pulled toward the sake', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(CHART)
    const result = await rateSake(123, 5)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    // weight (5-3)/5 = 0.4, target all 1s → f1 ≈ 0.5 + 0.4·0.5 = 0.7
    expect(result.profile.f1).toBeCloseTo(0.7, 5)
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(1)
  })

  it('skips (no event) when the sake has no FlavorProfile', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(null)
    const result = await rateSake(999, 5)
    expect(result.status).toBe('skipped_no_profile')
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(0)
  })

  it('rejects invalid input before rate-limiting or any lookup', async () => {
    const result = await rateSake(123, 9) // rating out of 1–5
    expect(result.status).toBe('invalid_input')
    expect(enforceRateLimit).not.toHaveBeenCalled()
    expect(lookupFlavorChart).not.toHaveBeenCalled()
  })

  it('returns rate_limited without persisting when the limiter denies', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      kind: 'denied',
      allowed: false,
      retryAfterSec: 3600,
    })
    const result = await rateSake(123, 5)
    expect(result).toMatchObject({ status: 'rate_limited', retryAfterSec: 3600 })
    expect(lookupFlavorChart).not.toHaveBeenCalled()
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(0)
  })

  it('surfaces session_missing from the limiter', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({ kind: 'session_missing' })
    expect((await rateSake(123, 5)).status).toBe('session_missing')
  })

  it('accumulates events across calls', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(CHART)
    await rateSake(123, 5)
    const second = await rateSake(123, 5)
    expect(second.status).toBe('ok')
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(2)
  })
})

describe('applyScanResult', () => {
  it('records a scan-accept at the +0.3 weight', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(CHART)
    const result = await applyScanResult(123)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    // scan weight 0.3, target all 1s → f1 ≈ 0.5 + 0.3·0.5 = 0.65
    expect(result.profile.f1).toBeCloseTo(0.65, 5)
  })

  it('skips a chartless sake', async () => {
    vi.mocked(lookupFlavorChart).mockResolvedValue(null)
    expect((await applyScanResult(123)).status).toBe('skipped_no_profile')
  })
})

describe('applyCrossBeverage', () => {
  it('seeds from a known descriptor + beverage', async () => {
    const sample = CROSS_BEVERAGE_MAP[0]!
    const result = await applyCrossBeverage({
      descriptor: sample.descriptor,
      beverage: sample.beverage,
    })
    expect(result.status).toBe('ok')
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(1)
  })

  it('returns unknown_descriptor with hints for an unmapped descriptor', async () => {
    const sample = CROSS_BEVERAGE_MAP[0]!
    const result = await applyCrossBeverage({ descriptor: '__nope__', beverage: sample.beverage })
    expect(result.status).toBe('unknown_descriptor')
    if (result.status !== 'unknown_descriptor') return
    expect(result.knownDescriptors.length).toBeGreaterThan(0)
    expect(await (h.store as InMemoryTasteEventStore).read('test-sid')).toHaveLength(0)
  })

  it('rejects an empty descriptor as invalid input', async () => {
    const result = await applyCrossBeverage({ descriptor: '   ', beverage: 'whisky' })
    expect(result.status).toBe('invalid_input')
    expect(enforceRateLimit).not.toHaveBeenCalled()
  })
})
