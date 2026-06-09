import { describe, expect, it } from 'vitest'
import {
  DEBUG_COOKIE_NAME,
  isDebugEnabledFromCookies,
  readDebugUrlParam,
} from './debug-mode'

function cookiesWith(name: string, value: string) {
  return {
    get: (n: string) => (n === name ? { value, name } : undefined),
  }
}

describe('readDebugUrlParam', () => {
  it.each([
    ['1', 'enable'],
    ['true', 'enable'],
    ['TRUE', 'enable'],
    ['True', 'enable'],
    ['0', 'disable'],
    ['false', 'disable'],
    ['False', 'disable'],
  ] as const)('reads "%s" as %s', (raw, expected) => {
    expect(readDebugUrlParam(new URLSearchParams(`debug=${raw}`))).toBe(expected)
  })

  it.each(['yes', 'no', '2', '', 'on', 'off'])(
    'returns null for unrecognised value "%s"',
    (raw) => {
      expect(readDebugUrlParam(new URLSearchParams(`debug=${raw}`))).toBeNull()
    },
  )

  it('returns null when the param is absent', () => {
    expect(readDebugUrlParam(new URLSearchParams())).toBeNull()
  })
})

describe('isDebugEnabledFromCookies', () => {
  it('returns true when the cookie value is the canonical "1"', () => {
    expect(isDebugEnabledFromCookies(cookiesWith(DEBUG_COOKIE_NAME, '1') as never)).toBe(
      true,
    )
  })

  it('returns false when the cookie is absent', () => {
    const cookies = { get: () => undefined }
    expect(isDebugEnabledFromCookies(cookies as never)).toBe(false)
  })

  it('returns false when the cookie value is anything other than "1"', () => {
    // Forged / leftover values shouldn't accidentally enable debug.
    expect(
      isDebugEnabledFromCookies(cookiesWith(DEBUG_COOKIE_NAME, 'true') as never),
    ).toBe(false)
    expect(isDebugEnabledFromCookies(cookiesWith(DEBUG_COOKIE_NAME, '') as never)).toBe(
      false,
    )
  })
})
