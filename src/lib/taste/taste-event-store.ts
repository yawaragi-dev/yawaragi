import { type TasteEvent, TasteEventSchema } from '@/lib/schemas/taste-event'

/**
 * Persistence seam for a User's TasteEvents (CONTEXT.md, ADR-0019).
 *
 * The store holds a per-session append-only list of TasteEvents keyed by the
 * anonymous session id (`session.sid`); the TasteProfile is DERIVED from them
 * by `deriveTasteProfile` on read (never stored as a snapshot). Modelled on the
 * rate-limiter's `KVClient` seam: a narrow interface with a production Upstash
 * adapter (`upstash-taste-event-store.ts`) and an in-memory double
 * (`in-memory-taste-event-store.ts`) for tests, so the actions and derivation
 * stay testable without a live Upstash.
 *
 * This module is intentionally NOT `server-only`: it holds only the interface,
 * two harmless constants, and pure helpers, so the in-memory test double can
 * reuse them at runtime. The one module that touches env + network — the
 * Upstash adapter — carries the `server-only` marker.
 */
export interface TasteEventStore {
  /** All TasteEvents for a session, oldest→newest. `[]` if none / expired. */
  read(sid: string): Promise<TasteEvent[]>
  /**
   * Append one TasteEvent, bound the list to {@link MAX_TASTE_EVENTS} (evicting
   * oldest), and refresh the TTL. Append-and-refresh so an active session keeps
   * its events alive while an abandoned one garbage-collects at the TTL edge.
   */
  append(sid: string, event: TasteEvent): Promise<void>
  /** Erase all TasteEvents for a session (the GDPR erasure path — ADR-0019). */
  clear(sid: string): Promise<void>
}

/**
 * Max TasteEvents retained per session. The derivation's time-decay makes old
 * events contribute ~nothing, so this is a storage cap, not a modelling limit —
 * generous because a single anonymous session won't realistically exceed it.
 */
export const MAX_TASTE_EVENTS = 100

/**
 * TTL of the stored event list, in seconds. Deliberately matches
 * `ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS` (24h) so the events never outlive
 * the session that owns them; refreshed on every append. Redefined here rather
 * than imported because that constant lives in a `server-only` module and this
 * one is client-safe — keep the two values in sync.
 */
export const TASTE_STORE_TTL_SECONDS = 60 * 60 * 24

/** The Redis key for a session's TasteEvent list. */
export function tasteEventKey(sid: string): string {
  return `taste:${sid}`
}

/**
 * Parse raw stored JSON strings back into TasteEvents, dropping any entry that
 * no longer parses or fails the schema (tampering, or a schema migration)
 * rather than throwing — one bad entry must not nuke the whole derived profile.
 */
export function parseStoredEvents(raw: readonly string[]): TasteEvent[] {
  const events: TasteEvent[] = []
  for (const item of raw) {
    let json: unknown
    try {
      json = JSON.parse(item)
    } catch {
      continue
    }
    const parsed = TasteEventSchema.safeParse(json)
    if (parsed.success) events.push(parsed.data)
  }
  return events
}
