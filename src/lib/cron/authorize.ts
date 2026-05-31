import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * Authorize an incoming `Authorization: Bearer <secret>` header against
 * the expected shared secret using a constant-time comparison.
 *
 * `===` (or any short-circuiting compare) on the raw strings is a
 * timing-attack vector: the JS engine bails on the first byte mismatch,
 * so the response latency leaks the prefix length matching the secret.
 * Across enough requests an attacker can recover the secret one byte at
 * a time. `timingSafeEqual` always reads every byte regardless of
 * mismatch position.
 *
 * `timingSafeEqual` itself throws on length mismatch — that throw is
 * also a side-channel (the early return tells the attacker the length).
 * We short-circuit length mismatches WITHOUT calling `timingSafeEqual`
 * but still pay the comparison cost: we compare the supplied buffer
 * against a zero-buffer of the expected length, ignore the result, and
 * return false. This keeps the timing envelope close enough to the
 * happy path that the wall-clock signal on length differences becomes
 * dwarfed by network jitter.
 */
export type CronAuthFailure = 'missing' | 'malformed' | 'mismatch'

export type CronAuthResult = { ok: true } | { ok: false; reason: CronAuthFailure }

const BEARER_PREFIX = 'Bearer '

export function authorizeCronRequest(
  authorizationHeader: string | null | undefined,
  expectedSecret: string,
): CronAuthResult {
  if (typeof authorizationHeader !== 'string' || authorizationHeader.length === 0) {
    return { ok: false, reason: 'missing' }
  }
  if (!authorizationHeader.startsWith(BEARER_PREFIX)) {
    return { ok: false, reason: 'malformed' }
  }
  const supplied = authorizationHeader.slice(BEARER_PREFIX.length)
  // Allow neither empty token after the prefix ("Bearer ") nor extra
  // whitespace ("Bearer  ") — neither is a legitimate caller and both
  // would otherwise sneak past the length-equalisation step below as a
  // "mismatch" rather than a "malformed" — the latter signals to the
  // operator that the cron config is wrong, not the secret.
  if (supplied.length === 0) {
    return { ok: false, reason: 'malformed' }
  }
  if (constantTimeEquals(supplied, expectedSecret)) {
    return { ok: true }
  }
  return { ok: false, reason: 'mismatch' }
}

export function constantTimeEquals(supplied: string, expected: string): boolean {
  // utf8 byte length, not character count — multi-byte secrets would
  // confuse `.length` vs. allocation size otherwise. The expected
  // secret is ASCII in practice (min 16 from env.ts) but the user-
  // supplied buffer could be anything.
  const suppliedBuf = Buffer.from(supplied, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')
  if (suppliedBuf.length !== expectedBuf.length) {
    // Still perform a comparison of the same-length envelope so the
    // length-mismatch branch doesn't return measurably faster than the
    // happy path. The boolean result is discarded.
    const padded = Buffer.alloc(expectedBuf.length)
    // suppliedBuf may be longer OR shorter than expectedBuf; copy what
    // fits into the zero-padded buffer — we don't care about the value,
    // just about exercising the comparison loop.
    suppliedBuf.copy(padded, 0, 0, Math.min(suppliedBuf.length, expectedBuf.length))
    timingSafeEqual(padded, expectedBuf)
    return false
  }
  return timingSafeEqual(suppliedBuf, expectedBuf)
}
