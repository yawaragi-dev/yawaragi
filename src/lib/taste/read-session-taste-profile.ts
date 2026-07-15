import 'server-only'

import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import type { TasteEventStore } from '@/lib/taste/taste-event-store'
import { isColdStart } from '@/lib/taste/taste-recommender'

/**
 * The `/profile` RSC's data source: read a session's TasteEvents and derive its
 * TasteProfile (ADR-0019). Kept pure over injected `(store, sid, now)` — the
 * cookie read + HMAC verification stay in the RSC (where they're E2E-tested),
 * so this is unit-testable without forging a signed cookie.
 */
export type SessionTasteProfile =
  | { kind: 'cold_start' }
  | { kind: 'profile'; profile: FlavorProfile; events: readonly TasteEvent[] }
  /** No session id or no store (non-production without Upstash / session env). */
  | { kind: 'unavailable' }

export interface ReadSessionTasteProfileInput {
  store: TasteEventStore | null
  sid: string | null
  now: number
}

export async function readSessionTasteProfile({
  store,
  sid,
  now,
}: ReadSessionTasteProfileInput): Promise<SessionTasteProfile> {
  if (store == null || sid == null) {
    return { kind: 'unavailable' }
  }
  const events = await store.read(sid)
  if (isColdStart(events)) {
    return { kind: 'cold_start' }
  }
  return { kind: 'profile', profile: deriveTasteProfile(events, now), events }
}
