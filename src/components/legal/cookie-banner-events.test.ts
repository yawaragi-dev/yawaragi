import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearCookiePreferencesRequest,
  isCookiePreferencesRequested,
  isCookiePreferencesRequestedOnServer,
  requestCookiePreferences,
  subscribeCookiePreferences,
} from './cookie-banner-events'

// Why this channel is a store and not a `window` event: `<CookieBanner />`
// used to hear the request in an effect, so nothing was listening until it had
// hydrated — while the controls that reopen it are in the SSR HTML and
// clickable immediately. The tap did nothing, and that tap is the only way to
// WITHDRAW consent (ADR-0009: as easy as giving). CI caught it on a slower
// runner before a visitor did.
//
// A store answers during render, so the state these tests pin is exactly what
// the banner's FIRST client render sees.

afterEach(() => {
  clearCookiePreferencesRequest()
  vi.restoreAllMocks()
})

describe('cookie-preferences requests', () => {
  it('is already visible to a reader that arrives after the request', () => {
    // Nobody subscribed yet — the hydration window.
    requestCookiePreferences()

    expect(isCookiePreferencesRequested()).toBe(true)
  })

  it('tells a subscriber that arrived earlier', () => {
    const onChange = vi.fn()
    subscribeCookiePreferences(onChange)

    requestCookiePreferences()

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('ignores a second request, so a double tap does not queue two', () => {
    const onChange = vi.fn()
    subscribeCookiePreferences(onChange)

    requestCookiePreferences()
    requestCookiePreferences()

    expect(onChange).toHaveBeenCalledOnce()
  })

  it('clears, so the request cannot hold the banner open against a save', () => {
    requestCookiePreferences()

    clearCookiePreferencesRequest()

    expect(isCookiePreferencesRequested()).toBe(false)
  })

  it('stops notifying an unsubscribed reader', () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeCookiePreferences(onChange)
    unsubscribe()

    requestCookiePreferences()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('reports nothing requested on the server, so hydration matches', () => {
    requestCookiePreferences()

    // Module state exists in this process, but the server snapshot must be the
    // value the first client render also computes.
    expect(isCookiePreferencesRequestedOnServer()).toBe(false)
  })
})
