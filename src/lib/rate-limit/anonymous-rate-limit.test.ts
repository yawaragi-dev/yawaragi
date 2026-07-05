import { describe, expect, it } from 'vitest'
import { anonymousRateLimit } from './anonymous-rate-limit'
import { InMemoryKVClient } from './in-memory-kv-client'

/**
 * The rate-limit cap and window are constants in
 * `anonymous-rate-limit.ts`; these tests assume `vision-scan = 5 calls /
 * 24h`. If those constants change the test cap below stays in sync.
 */
const CAP = 5
const WINDOW_MS = 24 * 60 * 60 * 1000

function makeDeps(startMs: number) {
  // Mutable clock + deterministic member generator so each call gets a
  // unique sorted-set member but the test still controls ordering.
  let clock = startMs
  let counter = 0
  const kv = new InMemoryKVClient(() => clock)
  return {
    kv,
    deps: {
      kv,
      now: () => clock,
      member: () => `m${counter++}`,
    },
    advance: (ms: number) => {
      clock += ms
    },
  }
}

describe('anonymousRateLimit — single-identifier exhaustion', () => {
  it('allows the first 5 calls and denies the 6th within the same window', async () => {
    const start = 1_700_000_000_000
    const { deps, advance } = makeDeps(start)

    for (let i = 0; i < CAP; i++) {
      const r = await anonymousRateLimit(
        { cookieId: 'cookie-A', ipHashed: 'ip-A', bucket: 'vision-scan' },
        deps,
      )
      expect(r.allowed).toBe(true)
      expect(r.remaining).toBe(CAP - i - 1)
      advance(1_000)
    }

    const denied = await anonymousRateLimit(
      { cookieId: 'cookie-A', ipHashed: 'ip-A', bucket: 'vision-scan' },
      deps,
    )
    expect(denied.allowed).toBe(false)
    expect(denied.remaining).toBe(0)
    expect(denied.retryAfterSec).toBeGreaterThan(0)
  })
})

describe('anonymousRateLimit — sliding-window reset', () => {
  it('lets a new call through once the oldest in-window entry ages out', async () => {
    const start = 1_700_000_000_000
    const { deps, advance } = makeDeps(start)

    // Burn the budget within the first second of the window.
    for (let i = 0; i < CAP; i++) {
      await anonymousRateLimit(
        { cookieId: 'cookie-B', ipHashed: 'ip-B', bucket: 'vision-scan' },
        deps,
      )
    }
    // Still in-window: denied.
    expect(
      (
        await anonymousRateLimit(
          { cookieId: 'cookie-B', ipHashed: 'ip-B', bucket: 'vision-scan' },
          deps,
        )
      ).allowed,
    ).toBe(false)

    // Advance past the full window — every entry has aged out.
    advance(WINDOW_MS + 1)

    const r = await anonymousRateLimit(
      { cookieId: 'cookie-B', ipHashed: 'ip-B', bucket: 'vision-scan' },
      deps,
    )
    expect(r.allowed).toBe(true)
    // Counter resets — this is the first call of the new window.
    expect(r.remaining).toBe(CAP - 1)
  })
})

describe('anonymousRateLimit — dual-identifier behavior', () => {
  it('denies when the IP-hash side is exhausted even after the cookie rotates (NAT case)', async () => {
    const start = 1_700_000_000_000
    const { deps } = makeDeps(start)

    // Visitor #1 burns the IP budget under cookie-C1.
    for (let i = 0; i < CAP; i++) {
      const r = await anonymousRateLimit(
        { cookieId: 'cookie-C1', ipHashed: 'shared-ip', bucket: 'vision-scan' },
        deps,
      )
      expect(r.allowed).toBe(true)
    }

    // Visitor #2 arrives with a fresh cookie (or visitor #1 cleared
    // theirs) but shares the IP — the IP-hash budget denies.
    const denied = await anonymousRateLimit(
      { cookieId: 'cookie-C2', ipHashed: 'shared-ip', bucket: 'vision-scan' },
      deps,
    )
    expect(denied.allowed).toBe(false)
  })

  it('denies when the cookie side is exhausted even from a different IP (mobile network case)', async () => {
    const start = 1_700_000_000_000
    const { deps } = makeDeps(start)

    // Single cookie hammering through multiple IPs (e.g. mobile network
    // hopping between cell towers).
    for (let i = 0; i < CAP; i++) {
      const r = await anonymousRateLimit(
        { cookieId: 'cookie-D', ipHashed: `ip-${i}`, bucket: 'vision-scan' },
        deps,
      )
      expect(r.allowed).toBe(true)
    }

    const denied = await anonymousRateLimit(
      { cookieId: 'cookie-D', ipHashed: 'ip-new', bucket: 'vision-scan' },
      deps,
    )
    expect(denied.allowed).toBe(false)
  })
})

describe('anonymousRateLimit — bucket isolation', () => {
  // Cast past the type to smuggle in a bucket name that isn't a member of
  // the registered union — asserts the "no config = throw" invariant so a
  // typo'd bucket name at a future call site fails loud rather than
  // silently sharing a budget with an unrelated surface.
  type AnyBucket = string

  it('vision-scan exhaustion does not leak into the suggestions bucket (issue #143 co-existence)', async () => {
    const start = 1_700_000_000_000
    const { deps } = makeDeps(start)

    // Burn vision-scan to exhaustion.
    for (let i = 0; i < CAP; i++) {
      await anonymousRateLimit(
        { cookieId: 'cookie-E', ipHashed: 'ip-E', bucket: 'vision-scan' },
        deps,
      )
    }
    expect(
      (
        await anonymousRateLimit(
          { cookieId: 'cookie-E', ipHashed: 'ip-E', bucket: 'vision-scan' },
          deps,
        )
      ).allowed,
    ).toBe(false)

    // Suggestions bucket still has the full 3-call budget for the same
    // identifier — issue #143 co-locates the two surfaces and their
    // isolation is the invariant that lets a visitor whose scan quota is
    // exhausted still exercise suggest (and vice versa).
    const suggestFirst = await anonymousRateLimit(
      { cookieId: 'cookie-E', ipHashed: 'ip-E', bucket: 'suggestions' },
      deps,
    )
    expect(suggestFirst.allowed).toBe(true)
  })

  it('throws on an unknown / typo bucket name — no config = no silent budget share', async () => {
    const start = 1_700_000_000_000
    const { deps } = makeDeps(start)

    await expect(
      anonymousRateLimit(
        {
          cookieId: 'cookie-typo',
          ipHashed: 'ip-typo',
          bucket: 'sugestions' as unknown as AnyBucket as 'vision-scan',
        },
        deps,
      ),
    ).rejects.toThrow(/Unknown rate-limit bucket/)
  })
})

describe('anonymousRateLimit — remaining count', () => {
  it('reports the more-loaded identifier when cookie + IP diverge', async () => {
    const start = 1_700_000_000_000
    const { deps } = makeDeps(start)

    // Visitor #1 makes 3 calls on (cookie-F, ip-shared).
    for (let i = 0; i < 3; i++) {
      await anonymousRateLimit(
        { cookieId: 'cookie-F', ipHashed: 'ip-shared', bucket: 'vision-scan' },
        deps,
      )
    }
    // Visitor #2 on (cookie-G, ip-shared) — fresh cookie but the IP
    // bucket already has 3. The next call should report
    // remaining = CAP - 4 (the more-loaded side after this call).
    const r = await anonymousRateLimit(
      { cookieId: 'cookie-G', ipHashed: 'ip-shared', bucket: 'vision-scan' },
      deps,
    )
    expect(r.allowed).toBe(true)
    expect(r.remaining).toBe(CAP - 4)
  })
})
