import type { DebugEvent } from '@/lib/debug/debug-log'
import type { CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * Tagged-union result of the taste event-creation actions (`rateSake`,
 * `applyScanResult`, `applyCrossBeverage`). Lives in a sibling module because
 * Next's `'use server'` rule forbids non-async exports from an actions file —
 * same split as `suggest-action-state.ts` / `scan-action-state.ts`.
 *
 * `WithDebugLog` carries the ADR-0013 debug trace when the visitor has debug
 * mode on (`yawaragi_debug=1`); absent otherwise.
 */
type WithDebugLog<T> = T & { debugLog?: ReadonlyArray<DebugEvent> }

export type TasteActionState = WithDebugLog<
  /** Event recorded; `profile` is the freshly-derived TasteProfile so the UI
   *  can update the radar without a refetch. */
  | { status: 'ok'; profile: FlavorProfile }
  /** The Sake has no FlavorProfile (sparse coverage, ADR-0016) — it can't be
   *  placed in axis space, so no TasteEvent was created. Not an error. */
  | { status: 'skipped_no_profile' }
  /** Cross-beverage descriptor + beverage not in the deterministic table. */
  | { status: 'unknown_descriptor'; knownDescriptors: readonly string[] }
  /** Malformed arguments (bad brandId / rating / empty descriptor). */
  | { status: 'invalid_input' }
  | { status: 'rate_limited'; retryAfterSec: number }
  /** The `yawaragi_session` cookie was absent — defensive; the middleware is
   *  its sole writer, so this should not happen post-matcher. */
  | { status: 'session_missing' }
  /** Store / session env not configured (non-production only). */
  | { status: 'unavailable' }
  | { status: 'error' }
>

/** Argument shape for `applyCrossBeverage`. */
export interface CrossBeverageSeedInput {
  descriptor: string
  beverage: CrossBeverageMap['beverage']
}

/**
 * Rating bounds and granularity. Design v1.4 §5: each of the five stars is
 * split into halves, so the scale runs 0.5–5 in 0.5 steps. Zero is NOT a
 * rating — the star row has no "unrated" position; not rating is simply the
 * absence of an event.
 *
 * `MIN_RATING` was 1 and the scale integral until the design adopted half
 * stars. The derivation needed no change: `(rating − 3) / 5` is continuous,
 * so 2.5 reads as a mild negative (−0.1) and 3.5 a mild positive (+0.1),
 * with 3 still exactly inert.
 */
export const MIN_RATING = 0.5
export const MAX_RATING = 5
export const RATING_STEP = 0.5

/** True for a rating on the 0.5-step scale. Float-safe: `x % 0.5` is not,
 *  because 4.5 % 0.5 is 0 but 0.30000000000000004-style residue appears for
 *  values a caller computed rather than typed. Multiplying into integers
 *  sidesteps it. */
export const isValidRating = (n: number): boolean =>
  Number.isFinite(n) && n >= MIN_RATING && n <= MAX_RATING && Number.isInteger(n * 2)
