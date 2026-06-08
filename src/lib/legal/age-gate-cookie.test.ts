import { describe, expect, it } from 'vitest'
import {
  AGE_GATE_COOKIE_MAX_AGE_SECONDS,
  AGE_GATE_COOKIE_NAME,
  ageGateCookieAttrs,
  hasAcceptedAgeGate,
  isGatedPath,
  type CookieJar,
} from './age-gate-cookie'

function jar(cookies: Record<string, string>): CookieJar {
  return {
    get: (name) => (name in cookies ? { value: cookies[name] } : undefined),
  }
}

describe('hasAcceptedAgeGate', () => {
  it('returns true when a fresh cookie matches the current version', () => {
    const now = 1_700_000_000_000
    const attrs = ageGateCookieAttrs(now, false)
    expect(hasAcceptedAgeGate(jar({ [attrs.name]: attrs.value }), now)).toBe(
      true,
    )
  })

  it('returns false when no cookie is present', () => {
    expect(hasAcceptedAgeGate(jar({}))).toBe(false)
  })

  it('returns false when the cookie is older than one year', () => {
    const now = 1_700_000_000_000
    const oldValue = JSON.stringify({ v: 1, ts: now })
    const later = now + AGE_GATE_COOKIE_MAX_AGE_SECONDS * 1000 + 1
    expect(
      hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: oldValue }), later),
    ).toBe(false)
  })

  it('returns false when the cookie has a future timestamp', () => {
    const now = 1_700_000_000_000
    const future = JSON.stringify({ v: 1, ts: now + 1000 })
    expect(
      hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: future }), now),
    ).toBe(false)
  })

  it('returns false (without throwing) on a malformed cookie value', () => {
    expect(() =>
      hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: 'not-json' })),
    ).not.toThrow()
    expect(hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: 'not-json' }))).toBe(
      false,
    )
  })

  it('returns false when the cookie version does not match', () => {
    const now = 1_700_000_000_000
    const wrongVersion = JSON.stringify({ v: 999, ts: now })
    expect(
      hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: wrongVersion }), now),
    ).toBe(false)
  })

  it('returns false when the payload shape is wrong', () => {
    const garbage = JSON.stringify({ accepted: true })
    expect(hasAcceptedAgeGate(jar({ [AGE_GATE_COOKIE_NAME]: garbage }))).toBe(
      false,
    )
  })
})

describe('ageGateCookieAttrs', () => {
  it('marks Secure in production', () => {
    expect(ageGateCookieAttrs(0, true).secure).toBe(true)
  })

  it('does not mark Secure in development', () => {
    expect(ageGateCookieAttrs(0, false).secure).toBe(false)
  })

  it('is readable by the client (httpOnly is false)', () => {
    expect(ageGateCookieAttrs(0, true).httpOnly).toBe(false)
  })

  it('uses SameSite=Lax and root path', () => {
    const attrs = ageGateCookieAttrs(0, true)
    expect(attrs.sameSite).toBe('lax')
    expect(attrs.path).toBe('/')
  })
})

describe('isGatedPath', () => {
  it.each([
    '/',
    '/en',
    '/en/',
    '/de',
    '/de/',
    '/en/imprint',
    '/de/imprint',
    '/en/privacy',
    '/de/privacy',
    '/en/under-18',
    '/de/under-18',
    // PRD #105 §"Age-gate interaction" / issue #106: scan ENTRY CTA
    // (discovery affordance) renders pre-gate. The scan result auto-navigates
    // to `/sake/[brandId]`, which is gated below, so flavor / brand data is
    // still kept behind the gate.
    '/en/scan',
    '/de/scan',
    '/_next/static/chunks/main.js',
    '/_vercel/insights',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/some-image.png',
    '/some.font.woff2',
    '/api/health',
  ])('treats %s as ungated', (path) => {
    expect(isGatedPath(path)).toBe(false)
  })

  it.each([
    '/en/sake/foo',
    '/de/sake/foo',
    '/en/chat',
    '/de/chat',
    '/en/me',
    '/de/me',
    '/en/imprint-fake',
    '/de/privacy-fake',
  ])('treats %s as gated', (path) => {
    expect(isGatedPath(path)).toBe(true)
  })
})
