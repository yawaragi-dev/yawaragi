import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS,
  ANONYMOUS_SESSION_COOKIE_NAME,
  anonymousSessionCookieAttrs,
  readAnonymousSessionCookie,
} from '@/lib/legal/anonymous-session-cookie'
import { ensureAnonymousSessionCookie } from './middleware-issue'

const SECRET = 'test-secret-32-characters-minimum'

/**
 * Convenience: build a NextRequest with an optional session cookie
 * pre-populated. Uses `req.cookies.set(...)` after construction —
 * NextRequest built with a `cookie:` header ONLY doesn't populate the
 * jar in the vitest env, so the direct API is more reliable.
 */
function makeRequest(cookieValue?: string): NextRequest {
  const req = new NextRequest(new URL('https://example.test/en/suggest'))
  if (cookieValue) {
    req.cookies.set(ANONYMOUS_SESSION_COOKIE_NAME, cookieValue)
  }
  return req
}

describe('ensureAnonymousSessionCookie', () => {
  it('stamps a valid signed session cookie when the request has none', () => {
    const now = 1_700_000_000_000
    const request = makeRequest(undefined)
    const response = NextResponse.next()

    const returned = ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      now,
      false,
    )

    const set = returned.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)
    expect(set).toBeDefined()

    // The stamped value must round-trip through the same verifier the
    // action layer uses at read time — this is the load-bearing invariant.
    const parsed = readAnonymousSessionCookie(
      { get: (name) => (name === ANONYMOUS_SESSION_COOKIE_NAME ? { value: set!.value } : undefined) },
      SECRET,
      now,
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.ts).toBe(now)
  })

  it('does not re-issue when the request already carries a valid signed cookie', () => {
    const now = 1_700_000_000_000
    const attrs = anonymousSessionCookieAttrs(SECRET, undefined, now, false)
    const request = makeRequest(attrs.value)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      now,
      false,
    )

    // The response's cookie jar should NOT contain the session cookie —
    // pass-through means "response unchanged".
    expect(response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)).toBeUndefined()
  })

  it('re-issues when the incoming cookie signature is invalid (forged)', () => {
    const now = 1_700_000_000_000
    const attrs = anonymousSessionCookieAttrs(SECRET, undefined, now, false)
    const [payloadB64] = attrs.value.split('.')
    // Fabricated signature — same length as a real one but doesn't match.
    const forged = `${payloadB64}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`
    const request = makeRequest(forged)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      now,
      false,
    )

    const set = response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)
    expect(set).toBeDefined()
    // The new cookie's value is NOT the forged one — a real re-issue.
    expect(set!.value).not.toBe(forged)
  })

  it('re-issues when the incoming cookie is expired', () => {
    const mintedAt = 1_700_000_000_000
    const later = mintedAt + ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS * 1000 + 1
    const attrs = anonymousSessionCookieAttrs(SECRET, undefined, mintedAt, false)
    const request = makeRequest(attrs.value)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      later,
      false,
    )

    const set = response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)
    expect(set).toBeDefined()
    expect(set!.value).not.toBe(attrs.value)
  })

  it('stamps httpOnly + sameSite=Lax + path=/ + a positive maxAge (shipped attrs)', () => {
    const now = 1_700_000_000_000
    const request = makeRequest(undefined)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      now,
      false,
    )

    const set = response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)!
    expect(set.httpOnly).toBe(true)
    expect(set.sameSite).toBe('lax')
    expect(set.path).toBe('/')
    expect(set.maxAge).toBe(ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS)
    // dev mode: secure is false so localhost dev servers can set it
    // over HTTP.
    expect(set.secure).toBe(false)
  })

  it('marks the cookie Secure in production', () => {
    const now = 1_700_000_000_000
    const request = makeRequest(undefined)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: SECRET },
      now,
      true,
    )

    const set = response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)!
    expect(set.secure).toBe(true)
  })

  it('is a no-op when SESSION_COOKIE_SECRET is unset (non-production fallback)', () => {
    const now = 1_700_000_000_000
    const request = makeRequest(undefined)
    const response = NextResponse.next()

    ensureAnonymousSessionCookie(
      request,
      response,
      { SESSION_COOKIE_SECRET: undefined },
      now,
      false,
    )

    expect(response.cookies.get(ANONYMOUS_SESSION_COOKIE_NAME)).toBeUndefined()
  })
})
