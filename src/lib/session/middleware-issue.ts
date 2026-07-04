import 'server-only'

import type { NextRequest, NextResponse } from 'next/server'
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  anonymousSessionCookieAttrs,
  readAnonymousSessionCookie,
} from '@/lib/legal/anonymous-session-cookie'

/**
 * Middleware-side issuer for the `yawaragi_session` cookie.
 *
 * Why this lives in the middleware and NOT in each server action
 * (post-#161 fix):
 *
 *   - Next.js 15+ forbids `cookies().set(...)` during a Server Component
 *     render. `suggestAction` runs inline from `<SuggestPage>` (a Server
 *     Component reached via GET), which crashed with
 *     `Error: Cookies can only be modified in a Server Action or Route
 *     Handler` when the anonymous-session cookie was absent — see the
 *     Vercel Preview log referenced in the PR handoff.
 *   - Real Server Actions (POST-triggered via `<form action={...}>`) do
 *     allow cookie mutation, so the earlier `scan-action.ts` shape
 *     worked; but reusing that pattern from an RSC-render call site was
 *     a footgun.
 *   - Middleware always runs before render and always owns a
 *     `NextResponse`, so it's the correct single writer for
 *     request-scoped cookies. Actions from here on read only.
 *
 * The helper is pure w.r.t. everything outside the `response` object:
 * verifies the incoming cookie against the same HMAC that
 * `anonymousSessionCookieAttrs` signs with, and either passes through
 * (valid, unexpired) or writes a fresh signed cookie onto the response.
 *
 * Reuses `readAnonymousSessionCookie` and `anonymousSessionCookieAttrs`
 * from `@/lib/legal/anonymous-session-cookie` — no duplicated HMAC
 * logic. The cookie name / attrs / signing shape stay ADR-0009 RoPA-
 * compatible: 24h TTL from issuance, HttpOnly, SameSite=Lax, Secure in
 * prod.
 *
 * TTL SEMANTICS. The pre-refactor action-side code re-signed the cookie
 * on EVERY paid-API call (`anonymousSessionCookieAttrs(secret, existing
 * ?? undefined)`), sliding `ts` forward for active visitors. This
 * middleware helper only stamps when no valid cookie is present — so
 * an active visitor's cookie expires 24h from FIRST issuance, not 24h
 * from last activity. The rate-limit budget in Upstash KV still TTLs
 * at 24h from the last call on each identifier, so cost protection is
 * unaffected; the practical difference is that a daily active visitor
 * gets a fresh `sid` every 24h instead of the same sid indefinitely.
 * The IP-hash identifier (unchanged) still holds the budget across sid
 * churn, so no rate-limit bypass. ADR-0009's "24h sliding" wording is
 * updated to "24h TTL from issuance" in the follow-up.
 */
export interface EnsureAnonymousSessionEnv {
  /**
   * HMAC secret for the `yawaragi_session` cookie. Same env var the
   * actions used to read (`env.SESSION_COOKIE_SECRET`). When absent
   * or empty in a non-production build the helper skips issuance so
   * local dev keeps working without Upstash / secret plumbing.
   */
  SESSION_COOKIE_SECRET: string | undefined
}

/**
 * Read the request cookies; if a valid signed session is present the
 * response is unchanged. Otherwise stamp a fresh signed session on the
 * response.
 *
 * Non-production without `SESSION_COOKIE_SECRET`: no-op. The action
 * layer already skips rate-limit enforcement in that mode (see
 * `config-gate.ts`), so issuing a cookie no visitor would ever verify
 * would be pointless churn.
 *
 * Production with a missing secret: no-op here too — the action layer
 * fails closed at the same env-check gate (`assertRateLimitConfig`
 * throws), so the browser never gets far enough to notice the missing
 * cookie. Keeping this helper defensive means a partial-config
 * production deploy doesn't ALSO crash the middleware.
 */
export function ensureAnonymousSessionCookie(
  request: NextRequest,
  response: NextResponse,
  env: EnsureAnonymousSessionEnv,
  now: number = Date.now(),
  isProd: boolean = process.env.NODE_ENV === 'production',
): NextResponse {
  const secret = env.SESSION_COOKIE_SECRET
  if (!secret) return response

  const existing = readAnonymousSessionCookie(request.cookies, secret, now)
  if (existing) return response

  const attrs = anonymousSessionCookieAttrs(secret, undefined, now, isProd)
  response.cookies.set({
    name: attrs.name,
    value: attrs.value,
    httpOnly: attrs.httpOnly,
    sameSite: attrs.sameSite,
    secure: attrs.secure,
    path: attrs.path,
    maxAge: attrs.maxAge,
  })
  return response
}

/**
 * Cookie name the helper writes. Re-exported so tests and callers can
 * assert on it without reaching into the legal/ adapter.
 */
export { ANONYMOUS_SESSION_COOKIE_NAME }
