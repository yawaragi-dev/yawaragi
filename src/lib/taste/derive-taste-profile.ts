import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'

// Derive a User's TasteProfile from their TasteEvents (CONTEXT.md, ADR-0019).
//
// The TasteProfile is never stored as a snapshot — it is recomputed by this
// pure fold over the stored TasteEvents, so it stays reproducible and erasable.
// Incremental EMA over a running vector and replaying the events with the same
// weighting produce identical numbers (EMA is a fold); we replay, which keeps
// the inputs (for provenance) and makes erasure "drop the events".
//
// The rule, per axis, oldest event → newest:
//   v ← v + wEff · (target − v),  clamped to [0, 1] each step
// where wEff = signedWeight · 0.5^(ageDays / halfLife). There is no separate
// learning rate — the signed weight IS the step fraction. Recency is intrinsic
// to replay order (later events overwrite earlier ones); the half-life adds
// wall-clock fade so a stale profile softens toward neutral.

/** The max-entropy prior each axis starts at before any event is applied. */
export const NEUTRAL_AXIS = 0.5

/** Half-life (days) of a TasteEvent's influence — the time-decay knob. A
 *  month-old event counts half. Small = fast forgetting, large = long memory. */
export const TASTE_EVENT_HALF_LIFE_DAYS = 30

const DAY_MS = 86_400_000
const AXES = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'] as const

/**
 * The signed strength of a TasteEvent: direction (sign) + magnitude. Positive
 * pulls the vector toward the event's target, negative pushes it away.
 *
 * - rating: `(rating − 3) / 5` → ±0.4, with 3★ inert (0).
 * - scan-accept: `+0.3` — a positive signal, weaker than an explicit 5★.
 * - cross-beverage seed: `+0.5` — strongest; usually the cold-start event that
 *   must move an empty profile meaningfully.
 */
export function tasteEventWeight(event: TasteEvent): number {
  switch (event.kind) {
    case 'rating':
      return (event.rating - 3) / 5
    case 'scan_accept':
      return 0.3
    case 'cross_beverage_seed':
      return 0.5
  }
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export interface DeriveTasteProfileOptions {
  /** Override the time-decay half-life (days). Defaults to
   *  {@link TASTE_EVENT_HALF_LIFE_DAYS}. Must be > 0. */
  readonly halfLifeDays?: number
}

/**
 * Fold a set of TasteEvents into a six-axis TasteProfile as of `now`.
 *
 * Pure and deterministic: events are replayed oldest→newest (ties broken by
 * input order), and `now` is an explicit argument so the same (events, now)
 * always yields the same vector. The caller (a server action) supplies the
 * clock; `Date.now()` never appears here.
 *
 * The result is always a valid FlavorProfile — every axis is clamped to [0, 1]
 * at each step, so a negative "push-away" near a bound saturates rather than
 * escaping the cube.
 */
export function deriveTasteProfile(
  events: readonly TasteEvent[],
  now: number,
  options: DeriveTasteProfileOptions = {},
): FlavorProfile {
  const halfLifeDays = options.halfLifeDays ?? TASTE_EVENT_HALF_LIFE_DAYS

  const v: FlavorProfile = {
    f1: NEUTRAL_AXIS,
    f2: NEUTRAL_AXIS,
    f3: NEUTRAL_AXIS,
    f4: NEUTRAL_AXIS,
    f5: NEUTRAL_AXIS,
    f6: NEUTRAL_AXIS,
  }

  const ordered = events
    .map((event, index) => ({ event, index }))
    // Oldest first; stable tie-break on input order so equal timestamps replay
    // deterministically regardless of engine sort stability.
    .sort((a, b) => a.event.occurredAt - b.event.occurredAt || a.index - b.index)

  for (const { event } of ordered) {
    // Age is clamped at 0 so a future-dated event (clock skew) doesn't amplify.
    const ageDays = Math.max(0, (now - event.occurredAt) / DAY_MS)
    const decay = Math.pow(0.5, ageDays / halfLifeDays)
    const wEff = tasteEventWeight(event) * decay
    for (const axis of AXES) {
      v[axis] = clamp01(v[axis] + wEff * (event.target[axis] - v[axis]))
    }
  }

  return v
}
