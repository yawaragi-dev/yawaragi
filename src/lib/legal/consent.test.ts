import { describe, expect, it } from 'vitest'
import {
  CONSENT_COOKIE_NAME,
  CURRENT_CONSENT_VERSION,
  consentCookieAttrs,
  parseConsent,
  serializeConsent,
  type ConsentChoice,
} from './consent'

const ALL_COMBINATIONS: ConsentChoice[] = [
  { analytics: false, marketing: false },
  { analytics: true, marketing: false },
  { analytics: false, marketing: true },
  { analytics: true, marketing: true },
]

describe('parseConsent', () => {
  it('returns null when no cookie is present', () => {
    expect(parseConsent(undefined)).toBeNull()
  })

  it('returns null (without throwing) on a malformed value', () => {
    expect(() => parseConsent('not-json')).not.toThrow()
    expect(parseConsent('not-json')).toBeNull()
  })

  it('returns null when the version does not match the current one', () => {
    const old = JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: false,
      version: CURRENT_CONSENT_VERSION + 99,
    })
    expect(parseConsent(old)).toBeNull()
  })

  it('returns null when the payload is missing required fields', () => {
    expect(parseConsent('{"version":1}')).toBeNull()
    expect(parseConsent('{"analytics":true,"marketing":true}')).toBeNull()
  })

  it('preserves analytics and marketing flags from a valid payload', () => {
    const raw = JSON.stringify({
      necessary: true,
      analytics: true,
      marketing: false,
      version: CURRENT_CONSENT_VERSION,
    })
    expect(parseConsent(raw)).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
      version: CURRENT_CONSENT_VERSION,
    })
  })
})

describe('serializeConsent / parseConsent roundtrip', () => {
  it.each(ALL_COMBINATIONS)(
    'round-trips %j without loss',
    (choice) => {
      const decoded = parseConsent(serializeConsent(choice))
      expect(decoded).toEqual({
        necessary: true,
        analytics: choice.analytics,
        marketing: choice.marketing,
        version: CURRENT_CONSENT_VERSION,
      })
    },
  )

  it('always serialises with the current version', () => {
    const json = JSON.parse(
      serializeConsent({ analytics: true, marketing: false }),
    )
    expect(json.version).toBe(CURRENT_CONSENT_VERSION)
  })
})

describe('consentCookieAttrs', () => {
  it('uses the documented cookie name', () => {
    expect(
      consentCookieAttrs({ analytics: false, marketing: false }).name,
    ).toBe(CONSENT_COOKIE_NAME)
  })

  it('marks Secure in production', () => {
    expect(
      consentCookieAttrs({ analytics: false, marketing: false }, true).secure,
    ).toBe(true)
  })

  it('does not mark Secure in development', () => {
    expect(
      consentCookieAttrs({ analytics: false, marketing: false }, false).secure,
    ).toBe(false)
  })

  it('is readable by the client (httpOnly is false)', () => {
    expect(
      consentCookieAttrs({ analytics: false, marketing: false }).httpOnly,
    ).toBe(false)
  })

  it('uses SameSite=Lax and root path', () => {
    const attrs = consentCookieAttrs({ analytics: true, marketing: true })
    expect(attrs.sameSite).toBe('lax')
    expect(attrs.path).toBe('/')
  })
})
