import { describe, expect, it } from 'vitest'
import { authorizeCronRequest, constantTimeEquals } from './authorize'

const EXPECTED = 'aaaaaaaaaaaaaaaa' // 16 bytes, matches env.ts min

describe('authorizeCronRequest', () => {
  it('rejects a request with no Authorization header', () => {
    expect(authorizeCronRequest(null, EXPECTED)).toEqual({ ok: false, reason: 'missing' })
    expect(authorizeCronRequest(undefined, EXPECTED)).toEqual({ ok: false, reason: 'missing' })
    expect(authorizeCronRequest('', EXPECTED)).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects a header without the Bearer prefix', () => {
    expect(authorizeCronRequest(EXPECTED, EXPECTED)).toEqual({ ok: false, reason: 'malformed' })
    expect(authorizeCronRequest(`Token ${EXPECTED}`, EXPECTED)).toEqual({
      ok: false,
      reason: 'malformed',
    })
    expect(authorizeCronRequest(`bearer ${EXPECTED}`, EXPECTED)).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('rejects an empty Bearer token', () => {
    expect(authorizeCronRequest('Bearer ', EXPECTED)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects a wrong secret of the same length', () => {
    const wrong = 'b'.repeat(EXPECTED.length)
    expect(authorizeCronRequest(`Bearer ${wrong}`, EXPECTED)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('rejects a wrong secret of different length', () => {
    expect(authorizeCronRequest('Bearer too-short', EXPECTED)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(authorizeCronRequest(`Bearer ${EXPECTED}-extra`, EXPECTED)).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('accepts the exact secret with a Bearer prefix', () => {
    expect(authorizeCronRequest(`Bearer ${EXPECTED}`, EXPECTED)).toEqual({ ok: true })
  })
})

describe('constantTimeEquals', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEquals(EXPECTED, EXPECTED)).toBe(true)
  })

  it('returns false for same-length unequal strings without throwing', () => {
    const a = 'a'.repeat(32)
    const b = 'b'.repeat(32)
    expect(constantTimeEquals(a, b)).toBe(false)
  })

  it('returns false for shorter supplied without throwing on length mismatch', () => {
    expect(() => constantTimeEquals('short', EXPECTED)).not.toThrow()
    expect(constantTimeEquals('short', EXPECTED)).toBe(false)
  })

  it('returns false for longer supplied without throwing on length mismatch', () => {
    expect(() => constantTimeEquals(EXPECTED + 'extra', EXPECTED)).not.toThrow()
    expect(constantTimeEquals(EXPECTED + 'extra', EXPECTED)).toBe(false)
  })
})
