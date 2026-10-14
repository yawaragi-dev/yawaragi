import { describe, expect, it } from 'vitest'
import {
  DEBUG_COOKIE_MAX_AGE_SECONDS,
  DEBUG_COOKIE_NAME,
  type DebugGateConfig,
  debugCookieValue,
  isDebugEnabledFromCookies,
  readDebugUrlParam,
} from './debug-mode'

const TOKEN = 'a-maintainer-debug-token-of-32-chars-or-more'
const WITH_TOKEN: DebugGateConfig = { token: TOKEN, nodeEnv: 'production' }
const PRODUCTION_WITHOUT_TOKEN: DebugGateConfig = {
  token: undefined,
  nodeEnv: 'production',
}
const LOCAL_DEV: DebugGateConfig = { token: undefined, nodeEnv: 'development' }

const NOW = 1_800_000_000_000

function param(raw: string) {
  return new URLSearchParams({ debug: raw })
}

function cookiesWith(value: string | undefined) {
  return {
    get: (n: string) =>
      n === DEBUG_COOKIE_NAME && value !== undefined ? { value, name: n } : undefined,
  } as never
}

describe('turning debug mode on through the URL', () => {
  it('needs the maintainer token when one is configured', () => {
    expect(readDebugUrlParam(param(TOKEN), WITH_TOKEN)).toBe('enable')
  })

  it.each(['1', 'true', 'TRUE', TOKEN.slice(0, -1), `${TOKEN}x`, ''])(
    'ignores "%s" when a token is configured',
    (raw) => {
      expect(readDebugUrlParam(param(raw), WITH_TOKEN)).toBeNull()
    },
  )

  it('cannot be turned on at all on production without a token', () => {
    expect(readDebugUrlParam(param('1'), PRODUCTION_WITHOUT_TOKEN)).toBeNull()
    expect(readDebugUrlParam(param('true'), PRODUCTION_WITHOUT_TOKEN)).toBeNull()
  })

  it.each(['1', 'true', 'True'])(
    'still takes "%s" on a local dev server with no token',
    (raw) => {
      expect(readDebugUrlParam(param(raw), LOCAL_DEV)).toBe('enable')
    },
  )

  it.each(['0', 'false', 'False'])('anyone can turn it off with "%s"', (raw) => {
    expect(readDebugUrlParam(param(raw), WITH_TOKEN)).toBe('disable')
    expect(readDebugUrlParam(param(raw), PRODUCTION_WITHOUT_TOKEN)).toBe('disable')
  })

  it('does nothing when the param is absent', () => {
    expect(readDebugUrlParam(new URLSearchParams(), LOCAL_DEV)).toBeNull()
  })
})

describe('reading the debug cookie', () => {
  it('accepts the cookie the proxy issued', () => {
    const value = debugCookieValue(WITH_TOKEN, NOW)
    expect(value).not.toBeNull()
    expect(isDebugEnabledFromCookies(cookiesWith(value!), WITH_TOKEN, NOW)).toBe(true)
  })

  it('rejects a hand-written cookie', () => {
    for (const forged of ['1', 'true', '', `${NOW + 1000}.AAAA`]) {
      expect(isDebugEnabledFromCookies(cookiesWith(forged), WITH_TOKEN, NOW)).toBe(
        false,
      )
    }
  })

  it('rejects a cookie whose expiry was edited', () => {
    const value = debugCookieValue(WITH_TOKEN, NOW)!
    const [, sig] = value.split('.')
    const later = Math.floor(NOW / 1000) + 10 * DEBUG_COOKIE_MAX_AGE_SECONDS
    expect(
      isDebugEnabledFromCookies(cookiesWith(`${later}.${sig}`), WITH_TOKEN, NOW),
    ).toBe(false)
  })

  it('stops working after 24 hours even if the browser keeps it', () => {
    const value = debugCookieValue(WITH_TOKEN, NOW)!
    const dayLater = NOW + DEBUG_COOKIE_MAX_AGE_SECONDS * 1000 + 1
    expect(isDebugEnabledFromCookies(cookiesWith(value), WITH_TOKEN, dayLater)).toBe(
      false,
    )
  })

  it('stops working once the token is rotated', () => {
    const value = debugCookieValue(WITH_TOKEN, NOW)!
    const rotated: DebugGateConfig = { ...WITH_TOKEN, token: `${TOKEN}-rotated` }
    expect(isDebugEnabledFromCookies(cookiesWith(value), rotated, NOW)).toBe(false)
  })

  it('a cookie from a local dev server does not open production', () => {
    const devValue = debugCookieValue(LOCAL_DEV, NOW)!
    expect(isDebugEnabledFromCookies(cookiesWith(devValue), WITH_TOKEN, NOW)).toBe(
      false,
    )
    expect(
      isDebugEnabledFromCookies(cookiesWith(devValue), PRODUCTION_WITHOUT_TOKEN, NOW),
    ).toBe(false)
  })

  it('production without a token issues no cookie', () => {
    expect(debugCookieValue(PRODUCTION_WITHOUT_TOKEN, NOW)).toBeNull()
  })

  it('is off when the cookie is absent', () => {
    expect(isDebugEnabledFromCookies(cookiesWith(undefined), LOCAL_DEV, NOW)).toBe(
      false,
    )
  })
})
