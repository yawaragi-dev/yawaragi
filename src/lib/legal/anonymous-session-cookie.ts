import 'server-only'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  AnonymousSessionPayloadSchema,
  type AnonymousSessionPayload,
} from '@/lib/schemas/anonymous-session'

/**
 * `yawaragi_session` cookie helper.
 *
 * Per CONTEXT.md §"Anonymous session" and issue #107:
 *  - Name: `yawaragi_session`
 *  - TTL: 24h sliding (re-issued on every authenticated rate-limited call).
 *  - Payload: signed `{v, ts, sid}` — the same shape as the age-gate cookie
 *    plus an opaque ~16-byte `sid` that the rate-limiter uses as one of
 *    its two keys.
 *  - Attrs: `Secure` in production, `HttpOnly`, `SameSite=Lax`.
 *
 * Distinct from the age-gate cookie (`yawaragi_age_gate`, JMStV) and the
 * cookie-banner cookie (`yawaragi_consent`, GDPR). Three distinct regimes;
 * three distinct cookies; do not unify them.
 *
 * SIGNING. The age-gate cookie is unsigned because its payload is a
 * self-declaration — forging it is forging the user's own declaration,
 * which has no security impact. The anonymous-session cookie IS signed
 * because its `sid` serves as a rate-limit budget key — a forged `sid`
 * is a free rate-limit reset. The HMAC uses a server-side secret
 * (`SESSION_COOKIE_SECRET` env var), is verified in constant time, and
 * an invalid signature is treated as no cookie (a new one is issued).
 */

export const ANONYMOUS_SESSION_COOKIE_NAME = 'yawaragi_session'
/**
 * 24h sliding TTL — matches CONTEXT.md §"Anonymous session" and the
 * RoPA row in ADR-0009. The KV entries TTL at the same window, so
 * cookie + budget expire together.
 */
export const ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24
export const ANONYMOUS_SESSION_COOKIE_VERSION = 1

interface CookieJarReader {
  get(name: string): { value: string } | undefined
}

export interface AnonymousSessionCookieAttrs {
  name: typeof ANONYMOUS_SESSION_COOKIE_NAME
  value: string
  maxAge: number
  path: '/'
  sameSite: 'lax'
  secure: boolean
  httpOnly: true
}

/**
 * Reads and verifies the cookie. Returns the payload when:
 *  - the value is well-formed (`payload.signature`),
 *  - the HMAC signature matches (constant-time compare),
 *  - the version is current,
 *  - the issue timestamp is within the sliding-TTL window.
 *
 * Returns `null` for any other case (no cookie, malformed value, bad
 * signature, wrong version, expired, future-dated). Callers treat
 * `null` as "issue a fresh cookie".
 */
export function readAnonymousSessionCookie(
  jar: CookieJarReader,
  secret: string,
  now: number = Date.now(),
): AnonymousSessionPayload | null {
  const cookie = jar.get(ANONYMOUS_SESSION_COOKIE_NAME)
  if (!cookie?.value) return null
  return verifySignedCookieValue(cookie.value, secret, now)
}

/**
 * Produces the cookie attributes to write back to the visitor. Use
 * `payload` to renew an existing session (preserving the same `sid` so
 * the rate-limit budget continues to apply); pass `undefined` to mint a
 * fresh one.
 */
export function anonymousSessionCookieAttrs(
  secret: string,
  payload?: AnonymousSessionPayload,
  now: number = Date.now(),
  isProd: boolean = process.env.NODE_ENV === 'production',
): AnonymousSessionCookieAttrs {
  const resolved: AnonymousSessionPayload = payload
    ? { ...payload, ts: now }
    : { v: ANONYMOUS_SESSION_COOKIE_VERSION, ts: now, sid: newSid() }

  return {
    name: ANONYMOUS_SESSION_COOKIE_NAME,
    value: signCookieValue(resolved, secret),
    maxAge: ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    // `httpOnly` is true: the cookie identifier is a server-side rate-limit
    // key and is never read from client JS. Distinct from the age-gate
    // cookie (`httpOnly: false`) which the client uses to decide whether
    // to render the gate dialog.
    httpOnly: true,
  }
}

/**
 * Mints a fresh ~16-byte opaque session id, base64url-encoded. Used
 * only by `anonymousSessionCookieAttrs` (or directly by tests that want
 * to seed a specific value). Never derive this from the IP, user-agent,
 * or anything else identifying.
 */
export function newSid(): string {
  return base64UrlEncode(randomBytes(16))
}

// ---------- internals ----------

const HMAC_ALGO = 'sha256'
const SEPARATOR = '.'

/**
 * Cookie wire format: `<base64url(payloadJson)>.<base64url(hmac)>`. The
 * payload + HMAC are URL-safe so the value survives Set-Cookie without
 * escaping. The HMAC is keyed by `secret` and computed over the
 * payload-base64url bytes (not the JSON itself) so the verifier doesn't
 * have to re-serialise.
 */
function signCookieValue(payload: AnonymousSessionPayload, secret: string): string {
  const payloadJson = JSON.stringify(payload)
  const payloadBytes = Buffer.from(payloadJson, 'utf8')
  const payloadB64 = base64UrlEncode(payloadBytes)
  const sig = createHmac(HMAC_ALGO, secret).update(payloadB64).digest()
  const sigB64 = base64UrlEncode(sig)
  return `${payloadB64}${SEPARATOR}${sigB64}`
}

function verifySignedCookieValue(
  value: string,
  secret: string,
  now: number,
): AnonymousSessionPayload | null {
  const dot = value.indexOf(SEPARATOR)
  if (dot <= 0 || dot === value.length - 1) return null
  const payloadB64 = value.slice(0, dot)
  const sigB64 = value.slice(dot + 1)

  const expected = createHmac(HMAC_ALGO, secret).update(payloadB64).digest()
  let provided: Buffer
  try {
    provided = base64UrlDecode(sigB64)
  } catch {
    return null
  }
  if (provided.length !== expected.length) return null
  if (!timingSafeEqual(provided, expected)) return null

  let payloadJson: string
  try {
    payloadJson = base64UrlDecode(payloadB64).toString('utf8')
  } catch {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(payloadJson)
  } catch {
    return null
  }

  const validated = AnonymousSessionPayloadSchema.safeParse(parsed)
  if (!validated.success) return null

  const payload = validated.data
  if (payload.v !== ANONYMOUS_SESSION_COOKIE_VERSION) return null

  const ageMs = now - payload.ts
  if (ageMs < 0) return null
  if (ageMs > ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS * 1000) return null

  return payload
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}
