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

export const MIN_RATING = 1
export const MAX_RATING = 5
