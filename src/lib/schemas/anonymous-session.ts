import { z } from 'zod'

/**
 * Payload shape of the `yawaragi_session` cookie.
 *
 * The cookie is a signed, opaque, per-visitor identifier used as the
 * rate-limit budget key for paid-API surfaces (label-scan today,
 * suggestions in Phase 4). See CONTEXT.md §"Anonymous session" for the
 * canonical definition.
 *
 * Fields:
 *  - `v`   — version. Bump when the payload shape changes so old
 *            cookies are rejected on read and re-issued on the next call.
 *  - `ts`  — issue timestamp (ms epoch). Used to enforce the 24h sliding
 *            TTL even when the browser holds the cookie longer than the
 *            `maxAge` attribute (defence-in-depth — a forged cookie that
 *            sneaks past the HMAC check would still fail the TTL check).
 *  - `sid` — opaque 128-bit random id, base64url-encoded. Never derived
 *            from the IP, the user agent, or anything else identifying.
 *            This is the value the rate-limiter uses as one of its two
 *            keys; the other is the transient hashed IP.
 */
export const AnonymousSessionPayloadSchema = z.object({
  v: z.number().int(),
  ts: z.number().int().nonnegative(),
  sid: z.string().min(1),
})

export type AnonymousSessionPayload = z.infer<typeof AnonymousSessionPayloadSchema>
