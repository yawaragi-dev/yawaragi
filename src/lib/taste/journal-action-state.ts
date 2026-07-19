import type { JournalEntry } from '@/lib/schemas/journal-entry'

/**
 * Result of a journal write action (ADR-0020, P5.5-C). On success the action
 * returns the FULL journal (oldest→newest) after the mutation, so the caller can
 * re-render the list and re-derive the TasteMap without a second read — the same
 * "return the fresh state" shape the anonymous taste actions use.
 *
 * `forbidden` is the maintainer gate saying no (v1 is maintainer-only). It is
 * deliberately distinct from `unavailable` (store env unset, non-production):
 * one is authz, the other is config. The UI renders the private-beta example for
 * `forbidden`, and a quiet "not configured" state for `unavailable`.
 */
export type JournalActionState =
  | { status: 'ok'; entries: readonly JournalEntry[] }
  /** Caller is not an allowlisted maintainer (private beta). */
  | { status: 'forbidden' }
  /** Input failed validation (bad brand id, rating out of range, over-long notes). */
  | { status: 'invalid_input' }
  /** Edit/delete referenced an entry id not in this user's journal. */
  | { status: 'not_found' }
  /** The logged Sake has no FlavorChart, so it can't be placed in axis space. */
  | { status: 'skipped_no_profile' }
  /** No journal store (Upstash env unset — non-production). */
  | { status: 'unavailable' }
