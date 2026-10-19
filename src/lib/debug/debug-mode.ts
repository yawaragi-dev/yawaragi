import 'server-only'
import { createHmac } from 'node:crypto'
import type { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'
import { env } from '@/env'
import { constantTimeEquals } from '@/lib/cron/authorize'

/**
 * Global debug mode — a per-visitor opt-in flag that turns on the
 * <DebugPanel /> overlay on every page and unlocks per-step server-side
 * tracing through the scan / suggest / etc. flows.
 *
 * Activation (#120 — the trace maps the product's internal decisions,
 * so a visitor must not be able to turn it on):
 *   - With `DEBUG_TOKEN` set: `?debug=<DEBUG_TOKEN>`, compared in
 *     constant time. Anything else, including `?debug=1`, is ignored —
 *     the page renders as usual with no cookie set.
 *   - Without `DEBUG_TOKEN` on a production build (Production and
 *     Preview on Vercel both run `NODE_ENV=production`): debug mode
 *     cannot be turned on at all.
 *   - Without `DEBUG_TOKEN` on a local dev server: `?debug=1` /
 *     `?debug=true` (case-insensitive), as before.
 *   - The proxy removes the param on its redirect, so the token does
 *     not stay in the address bar or the history entry.
 *   - Deactivation: `?debug=0` or `?debug=false` clears the cookie,
 *     for anyone.
 *
 * Cookie:
 *   - Name: `yawaragi_debug`. Value is `<expiry>.<hmac>`: the expiry
 *     in epoch seconds, signed with the token (or a fixed local-dev
 *     secret). A hand-written value, an edited expiry, a cookie past
 *     its 24 hours and a cookie signed before the token was rotated
 *     are all rejected — the expiry is checked on the server, not left
 *     to the browser. Rotating `DEBUG_TOKEN` switches off every
 *     cookie issued so far.
 *   - 24h TTL, re-issued on activation. `HttpOnly` so client JS cannot
 *     read it.
 *
 * Posture:
 *   - Single-purpose: drives only the debug overlay and trace flows.
 *   - No analytics, no third-party processors.
 *   - Lawful basis: legitimate interest (operator opt-in for
 *     development / support purposes); the value is set only after an
 *     explicit URL-param activation by the operator. Documented in
 *     ADR-0009's RoPA when debug surfaces ship publicly.
 *   - The panel shows server-side detail (raw extractions, query
 *     parameters), which is why only the holder of the token can
 *     open it. What each `debugAdd(...)` may carry is ADR-0013's
 *     "Security exclusions" rule.
 */

export const DEBUG_COOKIE_NAME = 'yawaragi_debug'
export const DEBUG_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 // 24h
export const DEBUG_URL_PARAM = 'debug'

/**
 * Signs local-dev cookies when no `DEBUG_TOKEN` is set. Not a secret:
 * it is only ever used when `NODE_ENV !== 'production'`, and a cookie
 * it signed is rejected wherever a token is configured or the build is
 * a production one.
 */
const LOCAL_DEV_SIGNING_SECRET = 'yawaragi-local-dev-debug'
const SIGNED_PURPOSE = 'yawaragi_debug:v1'

export type DebugGateConfig = {
  token: string | undefined
  nodeEnv: string | undefined
}

function debugGateConfigFromEnv(): DebugGateConfig {
  return { token: env.DEBUG_TOKEN, nodeEnv: process.env.NODE_ENV }
}

function signingSecret(config: DebugGateConfig): string | null {
  if (config.token !== undefined) return config.token
  if (config.nodeEnv === 'production') return null
  return LOCAL_DEV_SIGNING_SECRET
}

function sign(expirySeconds: number, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${SIGNED_PURPOSE}:${expirySeconds}`)
    .digest('base64url')
}

/**
 * Parse `?debug=...` from a URL. Returns:
 *   - `'enable'` when the value opens debug mode under `config` (the
 *     token, or `1` / `true` on a local dev server without one)
 *   - `'disable'` for `0` / `false`
 *   - `null` for anything else, including a wrong token, or when the
 *     param is absent
 */
export function readDebugUrlParam(
  searchParams: URLSearchParams,
  config: DebugGateConfig = debugGateConfigFromEnv(),
): 'enable' | 'disable' | null {
  const raw = searchParams.get(DEBUG_URL_PARAM)
  if (raw === null) return null
  const lower = raw.toLowerCase()
  if (lower === '0' || lower === 'false') return 'disable'
  if (config.token !== undefined) {
    return raw.length > 0 && constantTimeEquals(raw, config.token) ? 'enable' : null
  }
  if (config.nodeEnv === 'production') return null
  return lower === '1' || lower === 'true' ? 'enable' : null
}

/**
 * The value the proxy stamps on activation, or `null` when debug mode
 * cannot be turned on under `config`.
 */
export function debugCookieValue(
  config: DebugGateConfig = debugGateConfigFromEnv(),
  now: number = Date.now(),
): string | null {
  const secret = signingSecret(config)
  if (secret === null) return null
  const expiry = Math.floor(now / 1000) + DEBUG_COOKIE_MAX_AGE_SECONDS
  return `${expiry}.${sign(expiry, secret)}`
}

/**
 * Whether debug mode is currently active for the request — true iff
 * the request carries a debug cookie signed under the current config
 * and not yet expired. URL-param activation is handled separately by
 * the proxy and stamps the cookie before downstream code sees the
 * request, so this single read covers both "freshly activated" and
 * "carried forward" cases.
 */
export function isDebugEnabledFromCookies(
  cookies: ReadonlyRequestCookies | NextRequest['cookies'],
  config: DebugGateConfig = debugGateConfigFromEnv(),
  now: number = Date.now(),
): boolean {
  const value = cookies.get(DEBUG_COOKIE_NAME)?.value
  if (value === undefined) return false
  const secret = signingSecret(config)
  if (secret === null) return false

  const dot = value.indexOf('.')
  if (dot <= 0) return false
  const expiryText = value.slice(0, dot)
  if (!/^\d+$/.test(expiryText)) return false
  const expiry = Number(expiryText)
  if (expiry * 1000 <= now) return false
  // A legitimately issued cookie never expires further out than one
  // TTL from now; a later expiry can only be hand-made.
  if (expiry * 1000 > now + DEBUG_COOKIE_MAX_AGE_SECONDS * 1000) return false
  return constantTimeEquals(value.slice(dot + 1), sign(expiry, secret))
}

/**
 * Stamp the debug cookie on a NextResponse — used by the proxy on
 * `?debug=` activation. Returns `false`, leaving the response alone,
 * when debug mode cannot be turned on under `config`.
 */
export function setDebugCookie(
  response: NextResponse,
  config: DebugGateConfig = debugGateConfigFromEnv(),
): boolean {
  const value = debugCookieValue(config)
  if (value === null) return false
  response.cookies.set({
    name: DEBUG_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: 'lax',
    // Secure only off in non-HTTPS local dev — in practice the framework
    // strips the attribute when not on HTTPS. Marking secure here keeps
    // production safe even without HTTPS-only enforcement at the edge.
    secure: true,
    path: '/',
    maxAge: DEBUG_COOKIE_MAX_AGE_SECONDS,
  })
  return true
}

/**
 * Clear the debug cookie on a NextResponse — used by the proxy on
 * `?debug=0` deactivation.
 */
export function clearDebugCookie(response: NextResponse): NextResponse {
  response.cookies.set({ name: DEBUG_COOKIE_NAME, value: '', path: '/', maxAge: 0 })
  return response
}
