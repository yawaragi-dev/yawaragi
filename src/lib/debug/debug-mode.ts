import 'server-only'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

/**
 * Global debug mode — a per-visitor opt-in flag that turns on the
 * <DebugPanel /> overlay on every page and unlocks per-step server-side
 * tracing through the scan / suggest / etc. flows.
 *
 * Activation:
 *   - URL: `?debug=1` or `?debug=true` (case-insensitive). The proxy
 *     normalises and stores the value in the cookie; the URL param
 *     itself is removed on the redirect so the cookie alone carries the
 *     state forward.
 *   - Deactivation: `?debug=0` or `?debug=false` clears the cookie.
 *
 * Cookie:
 *   - Name: `yawaragi_debug`. Value is the literal string `"1"`. Absent
 *     cookie means debug is off (the default).
 *   - 24h TTL, sliding (re-issued on activation). Short window so a
 *     stranger who shares an `?debug=1` URL doesn't accidentally leave
 *     debug on for the recipient permanently. `HttpOnly` so client JS
 *     cannot read or forge it — the panel is server-rendered for the
 *     initial paint, and client mutations go through the same proxy
 *     redirect path.
 *
 * Posture:
 *   - Single-purpose: drives only the debug overlay and trace flows.
 *   - No analytics, no third-party processors.
 *   - Lawful basis: legitimate interest (operator opt-in for
 *     development / support purposes); the value is set only after an
 *     explicit URL-param activation by the operator. Documented in
 *     ADR-0009's RoPA when debug surfaces ship publicly.
 *   - Pre-launch / single-maintainer scope: the panel can leak
 *     server-side detail (raw extractions, query parameters). A
 *     production gating layer (e.g. cookie + bearer-token check)
 *     belongs to a future hardening slice — see the open follow-up
 *     issue.
 */

export const DEBUG_COOKIE_NAME = 'yawaragi_debug'
export const DEBUG_COOKIE_VALUE = '1'
export const DEBUG_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 // 24h sliding
export const DEBUG_URL_PARAM = 'debug'

/**
 * Cookie attributes used by the proxy when stamping the cookie on a
 * response. Centralised so the activation path and any future
 * server-side mutation use the same shape.
 */
export const DEBUG_COOKIE_SET_OPTIONS = {
  name: DEBUG_COOKIE_NAME,
  value: DEBUG_COOKIE_VALUE,
  httpOnly: true,
  sameSite: 'lax' as const,
  // Secure only off in non-HTTPS local dev — in practice the framework
  // strips the attribute when not on HTTPS. Marking secure here keeps
  // production safe even without HTTPS-only enforcement at the edge.
  secure: true,
  path: '/',
  maxAge: DEBUG_COOKIE_MAX_AGE_SECONDS,
} as const

export const DEBUG_COOKIE_CLEAR_OPTIONS = {
  name: DEBUG_COOKIE_NAME,
  value: '',
  path: '/',
  maxAge: 0,
} as const

/**
 * Parse `?debug=...` from a URL. Returns:
 *   - `'enable'` for `1` / `true` (case-insensitive)
 *   - `'disable'` for `0` / `false`
 *   - `null` for any other value or absent param
 */
export function readDebugUrlParam(
  searchParams: URLSearchParams,
): 'enable' | 'disable' | null {
  const raw = searchParams.get(DEBUG_URL_PARAM)
  if (raw === null) return null
  const lower = raw.toLowerCase()
  if (lower === '1' || lower === 'true') return 'enable'
  if (lower === '0' || lower === 'false') return 'disable'
  return null
}

/**
 * Whether debug mode is currently active for the request — true iff
 * the request carries the debug cookie. URL-param activation is
 * handled separately by the proxy and stamps the cookie before
 * downstream code sees the request, so this single read covers both
 * "freshly activated" and "carried forward" cases.
 */
export function isDebugEnabledFromCookies(
  cookies: ReadonlyRequestCookies | NextRequest['cookies'],
): boolean {
  return cookies.get(DEBUG_COOKIE_NAME)?.value === DEBUG_COOKIE_VALUE
}

/**
 * Stamp the debug cookie on a NextResponse — used by the proxy on
 * `?debug=enable` activation and re-stamped on every subsequent
 * request to slide the TTL forward (handled separately).
 */
export function setDebugCookie(response: NextResponse): NextResponse {
  response.cookies.set(DEBUG_COOKIE_SET_OPTIONS)
  return response
}

/**
 * Clear the debug cookie on a NextResponse — used by the proxy on
 * `?debug=disable` deactivation.
 */
export function clearDebugCookie(response: NextResponse): NextResponse {
  response.cookies.set(DEBUG_COOKIE_CLEAR_OPTIONS)
  return response
}
