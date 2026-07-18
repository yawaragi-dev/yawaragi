import { describe, expect, it } from 'vitest'
import { isMaintainer, parseMaintainerAllowlist } from '@/lib/auth/maintainer-allowlist'

describe('parseMaintainerAllowlist', () => {
  it('splits a comma-separated list and trims each id', () => {
    const allowlist = parseMaintainerAllowlist('user_a, user_b ,user_c')
    expect([...allowlist].sort()).toEqual(['user_a', 'user_b', 'user_c'])
  })

  it('drops empty segments from stray or trailing commas', () => {
    expect([...parseMaintainerAllowlist('user_a,,user_b,')]).toEqual(['user_a', 'user_b'])
  })

  it('treats an unset or blank value as an empty allowlist (fail-closed)', () => {
    expect(parseMaintainerAllowlist(undefined).size).toBe(0)
    expect(parseMaintainerAllowlist(null).size).toBe(0)
    expect(parseMaintainerAllowlist('   ').size).toBe(0)
  })
})

describe('isMaintainer', () => {
  const allowlist = parseMaintainerAllowlist('user_admin')

  it('admits a listed user id', () => {
    expect(isMaintainer('user_admin', allowlist)).toBe(true)
  })

  it('rejects a user id that is not on the list', () => {
    expect(isMaintainer('user_stranger', allowlist)).toBe(false)
  })

  it('rejects an anonymous / signed-out caller (no user id)', () => {
    expect(isMaintainer(null, allowlist)).toBe(false)
    expect(isMaintainer(undefined, allowlist)).toBe(false)
  })

  it('admits no one when the allowlist is empty, even a real id', () => {
    expect(isMaintainer('user_admin', parseMaintainerAllowlist(''))).toBe(false)
  })
})
