import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateText } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

// `meteredCall` is the one place a paid request pays its rate limit. These
// tests drive it with the real rate-limit gate (`enforceRateLimit`) and stub
// only what has no answer in a unit test: the request's cookies and headers,
// Clerk, the session cookie's signature and the Upstash budget.

const h = vi.hoisted(() => ({
  env: {
    RATE_LIMIT_BYPASS: undefined as string | undefined,
    SESSION_COOKIE_SECRET: 'secret',
    IP_HASH_SALT: 'salt',
    UPSTASH_REDIS_REST_URL: 'https://kv.example',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    VERCEL_ENV: undefined as string | undefined,
  },
  cookies: {} as Record<string, string>,
  session: { sid: 'session-id-0123456789' } as { sid: string } | null,
  budget: { allowed: true, remaining: 4, retryAfterSec: 0 },
  spans: [] as string[],
}))

vi.mock('@/env', () => ({ env: h.env }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name in h.cookies ? { name, value: h.cookies[name] } : undefined),
  })),
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}))
vi.mock('@/lib/auth/maintainer', () => ({ currentUserIsMaintainer: async () => false }))
vi.mock('@/lib/legal/anonymous-session-cookie', () => ({
  readAnonymousSessionCookie: vi.fn(() => h.session),
}))
vi.mock('@/lib/rate-limit/upstash-kv-client', () => ({ UpstashKVClient: vi.fn() }))
const anonymousRateLimit = vi.fn<(args: { bucket: string }) => Promise<typeof h.budget>>(async () => h.budget)
vi.mock('@/lib/rate-limit/anonymous-rate-limit', () => ({
  anonymousRateLimit: (args: { bucket: string }) => anonymousRateLimit(args),
}))
vi.mock('@/lib/stats/count-usage', () => ({ countUsage: vi.fn() }))
// The Langfuse span: record which one opened and what it was told.
vi.mock('@langfuse/tracing', () => ({
  startActiveObservation: (name: string, fn: () => unknown) => {
    h.spans.push(name)
    return fn()
  },
  updateActiveObservation: vi.fn(),
}))

import { updateActiveObservation } from '@langfuse/tracing'
import { debugAdd } from '@/lib/debug/debug-log'
import { countUsage } from '@/lib/stats/count-usage'
import { meteredCall } from './metered-call'

type Answer = { status: 'answered'; text: string; remaining?: number } | { status: 'rate_limited'; retryAfterSec: number } | { status: 'session_missing' }

/** A model that always answers "an answer" and keeps a list of its calls. */
function model() {
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'an answer' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: undefined },
      },
      warnings: [],
    }),
  })
}

/** One paid call: ask the model once the meter lets it through. */
function askModel(llm: MockLanguageModelV3, options: Partial<Parameters<typeof meteredCall<Answer>>[0]> = {}) {
  return meteredCall<Answer>({ bucket: 'suggestions', logPrefix: '[test]', ...options }, (meter) =>
    meter.pay(async ({ remaining }) => {
      const { text } = await generateText({ model: llm, prompt: 'which sake?' })
      return { status: 'answered', text, ...(remaining === undefined ? {} : { remaining }) }
    }),
  )
}

beforeEach(() => {
  h.env.RATE_LIMIT_BYPASS = undefined
  h.cookies = {}
  h.session = { sid: 'session-id-0123456789' }
  h.budget = { allowed: true, remaining: 4, retryAfterSec: 0 }
  h.spans = []
  vi.clearAllMocks()
})

describe('meteredCall — the rate limit comes before the model', () => {
  it('lets the model answer while the budget lasts, and says how much is left', async () => {
    const llm = model()

    const result = await askModel(llm)

    expect(result).toEqual({ status: 'answered', text: 'an answer', remaining: 4 })
    expect(llm.doGenerateCalls).toHaveLength(1)
    expect(anonymousRateLimit).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'suggestions' }))
  })

  it('never calls the model once the budget is spent', async () => {
    h.budget = { allowed: false, remaining: 0, retryAfterSec: 3600 }
    const llm = model()

    const result = await askModel(llm)

    expect(result).toEqual({ status: 'rate_limited', retryAfterSec: 3600 })
    expect(llm.doGenerateCalls).toHaveLength(0)
  })

  it('never calls the model for a request without a session cookie', async () => {
    h.session = null
    const llm = model()

    const result = await askModel(llm)

    expect(result).toEqual({ status: 'session_missing' })
    expect(llm.doGenerateCalls).toHaveLength(0)
  })

  it('charges the bucket the surface names, not another one', async () => {
    await askModel(model(), { bucket: 'vision-scan' })

    expect(anonymousRateLimit).toHaveBeenCalledTimes(1)
    expect(anonymousRateLimit).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'vision-scan' }))
  })

  it('refuses to charge one request twice', async () => {
    await expect(
      meteredCall<Answer>({ bucket: 'suggestions', logPrefix: '[test]' }, async (meter) => {
        await meter.pay(async () => ({ status: 'answered', text: 'first' }))
        return meter.pay(async () => ({ status: 'answered', text: 'second' }))
      }),
    ).rejects.toThrow(/once/)
    expect(anonymousRateLimit).toHaveBeenCalledTimes(1)
  })

  it('does not charge a request that ends before paying (a bad form, a resent photo)', async () => {
    const result = await meteredCall<Answer>({ bucket: 'vision-scan', logPrefix: '[test]' }, async () => ({
      status: 'session_missing',
    }))

    expect(result).toEqual({ status: 'session_missing' })
    expect(anonymousRateLimit).not.toHaveBeenCalled()
  })
})

describe('meteredCall — RATE_LIMIT_BYPASS', () => {
  afterEach(() => {
    h.env.RATE_LIMIT_BYPASS = undefined
  })

  it('lets every call through without reading the session or the budget, and says so in the log', async () => {
    h.env.RATE_LIMIT_BYPASS = '1'
    h.session = null
    h.budget = { allowed: false, remaining: 0, retryAfterSec: 3600 }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const llm = model()

    const result = await askModel(llm, { logPrefix: '[scan]' })

    expect(result).toEqual({ status: 'answered', text: 'an answer' })
    expect(llm.doGenerateCalls).toHaveLength(1)
    expect(anonymousRateLimit).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[scan\] RATE_LIMIT_BYPASS=1/))
    warn.mockRestore()
  })
})

describe('meteredCall — the debug log', () => {
  it('attaches what the call and the rate limit logged when the visitor has debug on', async () => {
    h.cookies = { yawaragi_debug: '1' }

    const result = await meteredCall<Answer>({ bucket: 'suggestions', logPrefix: '[test]' }, (meter) => {
      debugAdd('SuggestAction', 'entered')
      return meter.pay(async () => ({ status: 'answered', text: 'ok' }))
    })

    const sources = (result as { debugLog?: { source: string; message: string }[] }).debugLog?.map((e) => `${e.source}: ${e.message}`)
    expect(sources).toEqual(['SuggestAction: entered', expect.stringMatching(/^RateLimit: allowed \(4 remaining in suggestions bucket\)/)])
  })

  it('leaves the field out entirely when debug is off', async () => {
    const result = await askModel(model())

    expect(result).not.toHaveProperty('debugLog')
  })

  it('hands the body the request’s cookies, read once', async () => {
    h.cookies = { yawaragi_suggest_stub: 'ok' }

    const seen = await meteredCall({ bucket: 'taste', logPrefix: '[test]' }, async (meter) => ({
      stub: meter.cookieJar.get('yawaragi_suggest_stub')?.value,
    }))

    expect(seen).toEqual({ stub: 'ok' })
  })
})

describe('meteredCall — the span and the usage counter', () => {
  it('opens the named Langfuse span and records the outcome the surface classified', async () => {
    await askModel(model(), {
      span: { name: 'scan-action', metadata: { 'seed.kind': 'brand' }, classify: (r) => ({ outcome: r.status }) },
    })

    expect(h.spans).toEqual(['scan-action'])
    expect(updateActiveObservation).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { 'seed.kind': 'brand', 'action.outcome': 'answered' } }),
      { asType: 'span' },
    )
  })

  it('opens no span when the surface asks for none', async () => {
    await askModel(model())

    expect(h.spans).toEqual([])
  })

  it('counts the call under the name the surface picks from its result', async () => {
    await askModel(model(), { count: (r) => `scan:${r.status}` })

    expect(countUsage).toHaveBeenCalledExactlyOnceWith('scan:answered')
  })

  it('counts nothing when the surface picks no name', async () => {
    h.budget = { allowed: false, remaining: 0, retryAfterSec: 60 }

    await askModel(model(), { count: (r) => (r.status === 'answered' ? 'list_read' : null) })

    expect(countUsage).not.toHaveBeenCalled()
  })
})
