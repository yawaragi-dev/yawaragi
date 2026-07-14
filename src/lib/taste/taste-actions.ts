'use server'

import { cookies } from 'next/headers'
import { env } from '@/env'
import {
  knownCrossBeverageDescriptors,
  resolveCrossBeverageTarget,
} from '@/lib/cross-beverage/forward-lookup'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import type { FlavorAxes } from '@/lib/flavor/flavor-similarity'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import { enforceRateLimit } from '@/lib/rate-limit/enforce-rate-limit'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import { getTasteEventStore } from '@/lib/taste/get-taste-event-store'
import {
  type CrossBeverageSeedInput,
  MAX_RATING,
  MIN_RATING,
  type TasteActionState,
} from '@/lib/taste/taste-action-state'

/**
 * Phase 5 (#220) — the three TasteEvent creation actions. Each records one
 * TasteEvent into the session-keyed store and returns the freshly-derived
 * TasteProfile (ADR-0019). All three share the same envelope via
 * `recordTasteEvent`: validate → rate-limit (`taste` bucket) → resolve the
 * anonymous session → resolve a placeable target → append → derive.
 *
 * ADR-0013: every action runs under `runWithDebugLog` and traces its decision
 * points; the accumulated log rides back on the result when debug mode is on.
 */

/**
 * Pick the bare 6-axis FlavorProfile off any structural six-axis record — a
 * stored FlavorChart (rating / scan) or a CrossBeverageMap row (seed). Both
 * carry f1..f6; this drops the surrounding envelope (brandId, provenance,
 * exemplars) that a TasteEvent target doesn't need.
 */
function toProfile(axes: FlavorAxes): FlavorProfile {
  return {
    f1: axes.f1,
    f2: axes.f2,
    f3: axes.f3,
    f4: axes.f4,
    f5: axes.f5,
    f6: axes.f6,
  }
}

/** Outcome of an action-specific target resolution step. */
type ResolvedTarget =
  | { ok: true; event: TasteEvent }
  | { ok: false; state: TasteActionState }

/**
 * Shared envelope for the taste actions. Input validation happens in each
 * caller BEFORE this (so bad input never spends a rate-limit token and carries
 * no debug log, matching the suggest action). Here: rate-limit, then resolve
 * the session for the store key, then run the caller's target resolution
 * (which does any DB / table lookup — after the rate-limit gate so abuse can't
 * hammer the DB), then persist and derive.
 */
async function recordTasteEvent(
  label: string,
  resolveTarget: () => Promise<ResolvedTarget>,
): Promise<TasteActionState> {
  const cookieJar = await cookies()
  const log = isDebugEnabledFromCookies(cookieJar) ? new DebugLog() : undefined

  const result = await runWithDebugLog(log, async (): Promise<TasteActionState> => {
    debugAdd('TasteAction', `entered: ${label}`)

    const rateLimit = await enforceRateLimit({
      bucket: 'taste',
      logPrefix: '[taste]',
      debug: debugAdd,
    })
    if (rateLimit.kind === 'session_missing') return { status: 'session_missing' }
    if (!rateLimit.allowed) return { status: 'rate_limited', retryAfterSec: rateLimit.retryAfterSec }

    const secret = env.SESSION_COOKIE_SECRET
    if (!secret) {
      debugAdd(
        'TasteAction',
        'SESSION_COOKIE_SECRET unset — cannot resolve session (non-production)',
        undefined,
        'warn',
      )
      return { status: 'unavailable' }
    }
    const session = readAnonymousSessionCookie(cookieJar, secret)
    if (!session) return { status: 'session_missing' }

    const store = getTasteEventStore()
    if (!store) {
      debugAdd(
        'TasteAction',
        'taste store env unset — cannot persist (non-production)',
        undefined,
        'warn',
      )
      return { status: 'unavailable' }
    }

    const resolved = await resolveTarget()
    if (!resolved.ok) return resolved.state

    await store.append(session.sid, resolved.event)
    const events = await store.read(session.sid)
    const profile = deriveTasteProfile(events, Date.now())
    debugAdd('TasteAction', 'event recorded', {
      kind: resolved.event.kind,
      eventCount: events.length,
    })
    return { status: 'ok', profile }
  })

  return log ? { ...result, debugLog: log.toArray() } : result
}

/**
 * Record that the visitor rated a Sake 1–5. A 3-star rating is inert (weight
 * 0); below pushes the vector away, above pulls it toward the Sake's profile.
 */
export async function rateSake(brandId: number, rating: number): Promise<TasteActionState> {
  if (
    !Number.isInteger(brandId) ||
    brandId <= 0 ||
    !Number.isInteger(rating) ||
    rating < MIN_RATING ||
    rating > MAX_RATING
  ) {
    return { status: 'invalid_input' }
  }

  return recordTasteEvent('rateSake', async () => {
    const chart = await lookupFlavorChart(brandId)
    if (chart == null) {
      debugAdd('TasteAction', 'no FlavorProfile for brand — skipping event', { brandId }, 'warn')
      return { ok: false, state: { status: 'skipped_no_profile' } }
    }
    return {
      ok: true,
      event: { kind: 'rating', rating, brandId, target: toProfile(chart), occurredAt: Date.now() },
    }
  })
}

/**
 * Fold an accepted scan result into the taste profile. A positive signal
 * ("I'm drinking this") weaker than an explicit 5-star.
 */
export async function applyScanResult(brandId: number): Promise<TasteActionState> {
  if (!Number.isInteger(brandId) || brandId <= 0) {
    return { status: 'invalid_input' }
  }

  return recordTasteEvent('applyScanResult', async () => {
    const chart = await lookupFlavorChart(brandId)
    if (chart == null) {
      debugAdd('TasteAction', 'no FlavorProfile for brand — skipping event', { brandId }, 'warn')
      return { ok: false, state: { status: 'skipped_no_profile' } }
    }
    return {
      ok: true,
      event: { kind: 'scan_accept', brandId, target: toProfile(chart), occurredAt: Date.now() },
    }
  })
}

/**
 * Seed the taste profile from a familiar Western beverage descriptor via the
 * deterministic CrossBeverageMap — the cold-start hero. The LLM is never
 * involved; the mapping is table-driven.
 */
export async function applyCrossBeverage(input: CrossBeverageSeedInput): Promise<TasteActionState> {
  if (typeof input?.descriptor !== 'string' || input.descriptor.trim() === '') {
    return { status: 'invalid_input' }
  }
  const { descriptor, beverage } = input

  return recordTasteEvent('applyCrossBeverage', async () => {
    const row = resolveCrossBeverageTarget(descriptor, beverage)
    if (row == null) {
      debugAdd(
        'TasteAction',
        'no cross-beverage mapping — skipping event',
        { descriptor, beverage },
        'warn',
      )
      return {
        ok: false,
        state: {
          status: 'unknown_descriptor',
          knownDescriptors: knownCrossBeverageDescriptors(beverage),
        },
      }
    }
    return {
      ok: true,
      event: {
        kind: 'cross_beverage_seed',
        descriptor: row.descriptor,
        target: toProfile(row),
        occurredAt: Date.now(),
      },
    }
  })
}
