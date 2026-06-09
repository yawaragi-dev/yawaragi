import { describe, expect, it } from 'vitest'
import { extractIp, hashIp } from './ip-hash'

describe('hashIp', () => {
  it('produces a deterministic url-safe digest', () => {
    const a = hashIp('1.2.3.4', 'salt-1')
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(hashIp('1.2.3.4', 'salt-1')).toBe(a)
  })

  it('changes when the salt rotates', () => {
    expect(hashIp('1.2.3.4', 'salt-1')).not.toBe(hashIp('1.2.3.4', 'salt-2'))
  })

  it('changes when the ip changes', () => {
    expect(hashIp('1.2.3.4', 'salt-1')).not.toBe(hashIp('1.2.3.5', 'salt-1'))
  })

  it('does not collide on the salt-ip boundary (separator prevents concat ambiguity)', () => {
    // Without the 0-byte separator, hashIp('a', 'bc') == hashIp('ab', 'c').
    // With the separator they diverge.
    expect(hashIp('a', 'bc')).not.toBe(hashIp('ab', 'c'))
  })
})

describe('extractIp', () => {
  it('picks the leftmost entry of x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.1, 10.0.0.5' })
    expect(extractIp(headers)).toBe('203.0.113.1')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const headers = new Headers({ 'x-real-ip': '203.0.113.2' })
    expect(extractIp(headers)).toBe('203.0.113.2')
  })

  it('returns "unknown" when neither header is present', () => {
    expect(extractIp(new Headers())).toBe('unknown')
  })

  it('trims whitespace from the x-forwarded-for entry', () => {
    const headers = new Headers({ 'x-forwarded-for': '  203.0.113.3  ,  10.0.0.5  ' })
    expect(extractIp(headers)).toBe('203.0.113.3')
  })
})
