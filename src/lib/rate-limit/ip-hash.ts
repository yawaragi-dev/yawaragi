import 'server-only'

import { createHash } from 'node:crypto'

/**
 * SHA-256 of `salt + ip`. The plaintext IP MUST NEVER reach the
 * rate-limit module, KV, logs, or any persistent surface — this hash
 * function is the only place an IP touches the inside of the process.
 *
 * The salt is a server-side rotating secret (`IP_HASH_SALT` env var).
 * Rotating the salt invalidates the IP side of the budget for everyone
 * — that's intentional: the cookie identifier carries personal-data
 * uniqueness, the IP identifier is the "behind-shared-NAT" backstop.
 *
 * The hash is base64url-encoded, no padding, so it's a safe KV key
 * fragment.
 */
export function hashIp(ip: string, salt: string): string {
  const digest = createHash('sha256').update(salt).update('\0').update(ip).digest()
  return digest.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Extracts the visitor IP from the incoming headers. Falls back to
 * `'unknown'` (literally that string) when no plausible header is
 * present. Returning a constant for "unknown" means co-tenants behind
 * an opaque proxy share a single budget — generally OK at this point
 * in the pipeline (Vercel injects `x-forwarded-for`, so the unknown
 * branch only fires in local dev / synthetic tests).
 *
 * Order of headers checked, most-trusted first:
 *  - `x-forwarded-for` — Vercel sets this. First entry is the client.
 *  - `x-real-ip` — many reverse proxies set this.
 */
export function extractIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    // x-forwarded-for is a comma-separated list. The leftmost entry is
    // the originating client; later entries are intermediate proxies.
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}
