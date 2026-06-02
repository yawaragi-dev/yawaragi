import { describe, expect, it } from 'vitest'
import {
  AGE_GATE_COOKIE_NAME,
  ageGateCookieAttrs,
  type CookieJar,
} from './age-gate-cookie'
import {
  CONSENT_COOKIE_NAME,
  CURRENT_CONSENT_VERSION,
  serializeConsent,
} from './consent'
import { getComplianceState } from './compliance-state'

function jar(cookies: Record<string, string>): CookieJar {
  return {
    get: (name) => (name in cookies ? { value: cookies[name] } : undefined),
  }
}

describe('getComplianceState', () => {
  it('reflects acceptance and consent when both cookies are present', () => {
    const now = 1_700_000_000_000
    const ageAttrs = ageGateCookieAttrs(now, false)
    const state = getComplianceState(
      jar({
        [ageAttrs.name]: ageAttrs.value,
        [CONSENT_COOKIE_NAME]: serializeConsent({
          analytics: true,
          marketing: false,
        }),
      }),
      now,
    )

    expect(state.ageGate).toBe(true)
    expect(state.consent).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
      version: CURRENT_CONSENT_VERSION,
    })
  })

  it('reports age-gate accepted with no consent decision when only the age-gate cookie is present', () => {
    const now = 1_700_000_000_000
    const ageAttrs = ageGateCookieAttrs(now, false)
    const state = getComplianceState(
      jar({ [ageAttrs.name]: ageAttrs.value }),
      now,
    )

    expect(state.ageGate).toBe(true)
    expect(state.consent).toBeNull()
  })

  it('reports the consent decision with age-gate unaccepted when only the consent cookie is present', () => {
    const state = getComplianceState(
      jar({
        [CONSENT_COOKIE_NAME]: serializeConsent({
          analytics: false,
          marketing: false,
        }),
      }),
    )

    expect(state.ageGate).toBe(false)
    expect(state.consent).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
      version: CURRENT_CONSENT_VERSION,
    })
  })

  it('returns the empty-state shape when no cookies are present', () => {
    const state = getComplianceState(jar({}))

    expect(state.ageGate).toBe(false)
    expect(state.consent).toBeNull()
  })

  it('treats malformed cookie values as unaccepted / undecided without throwing', () => {
    const run = () =>
      getComplianceState(
        jar({
          [AGE_GATE_COOKIE_NAME]: 'not-json',
          [CONSENT_COOKIE_NAME]: '{not-valid-json',
        }),
      )

    expect(run).not.toThrow()
    const state = run()
    expect(state.ageGate).toBe(false)
    expect(state.consent).toBeNull()
  })
})
