import type { ConnectionFailure } from '@/lib/network/settle-request'
import type { EarlierScanRead } from '@/lib/schemas/earlier-scan-read'
import { earlierReadOf } from './earlier-read'
import { INITIAL_SCAN_ACTION_STATE, type ScanActionState } from './scan-action-state'

/**
 * The scan screen's session: everything the screen remembers between taps
 * that is not the read itself.
 *
 * The read is `useActionState`'s, and `useActionState` has no reset, so the
 * last answer stays in its state until the next photo replaces it. Most of
 * what is here exists to say how the screen relates to that answer — set
 * aside for the camera ("Scan again"), lost to the network, gone stale — and
 * to hold the rule-16 clock (design v1.9 S4, S5) for the read in flight.
 *
 * Pure: the timers, the browser's online events and the Server Action calls
 * live in `useScanSession`, which turns each of them into an event here.
 */

/** Which part of the bottle an after-scan nudge asks for (design v1.8, J). */
export type NudgeKind = 'details' | 'side' | 'sticker'

/** §7: the kind of list read from a menu or shelf photo. */
export type ListKind = 'menu' | 'shelf'

/**
 * How long a scan or a list read may take before the screen gives up on it
 * and offers to send the photo again. Well past a slow read (the second tier
 * included), so it only fires on a connection that has stopped answering.
 */
export const SCAN_TIMEOUT_MS = 30_000
/** Design v1.9 S4: past this, the camera says "Taking longer than usual" with Cancel. */
export const SCAN_SLOW_MS = 10_000

export interface ScanSession {
  /**
   * The visitor's photo as a `blob:` URL of the original file (never leaves
   * the browser), for the camera's still and the result card. `null` at the
   * camera.
   */
  photoUrl: string | null
  /** The photo is being downscaled in the browser, before anything is sent. */
  downscaling: boolean
  /** The photo could not be decoded; the bad-photo outcome shows. */
  downscaleFailed: boolean
  /**
   * The send in flight, and whether it has run past {@link SCAN_SLOW_MS}.
   * Only read while the action is pending, so it is never cleared: the next
   * send replaces it with a new token, and a stale timer finds the token
   * changed.
   */
  sending: { token: number; slow: boolean } | null
  /**
   * The last scan did not come back because of the network (design question
   * S). The camera keeps the photo with "Send again"; the answer before it
   * stays in the action's state so the retry still sends the earlier read.
   */
  connectionFailure: ConnectionFailure | null
  /** Sends of this photo that found no connection in a row: the second says "Still no connection" (S5). */
  offlineTries: number
  /** The visitor tapped "Scan again" and is back at the viewfinder, over an answer the action still holds. */
  dismissed: boolean
  /**
   * The part of the bottle the after-scan nudge asked for (design v1.8, J /
   * R3), so the camera it opens says what to frame. Cleared by the next photo.
   */
  askedFor: NudgeKind | null
  /** The list screen is up, for this kind of list; `null` on the scan screens. */
  listOpen: ListKind | null
  /**
   * #408: the answer on screen whose read is too old (or was let go) to
   * resolve the next photo with. Compared by identity with the action's state.
   */
  expired: ScanActionState | null
  /**
   * "Not this bottling?" on a scan that opened the visitor's own bottling
   * (design v1.7, 85): which photo and bottling it was said for, so the next
   * scan opens directly again.
   */
  lineViewFor: string | null
  /**
   * The bottle in hand is logged as the bottling its label names, unless the
   * visitor picked the sake as a whole for this photo (the photo URL it was
   * said for).
   */
  anyBottlingFor: string | null
  /** Bottlings created from a label on this screen, by `brandId|name`. */
  labelBottlingIds: Readonly<Record<string, string>>
}

export const INITIAL_SCAN_SESSION: ScanSession = {
  photoUrl: null,
  downscaling: false,
  downscaleFailed: false,
  sending: null,
  connectionFailure: null,
  offlineTries: 0,
  dismissed: false,
  askedFor: null,
  listOpen: null,
  expired: null,
  lineViewFor: null,
  anyBottlingFor: null,
  labelBottlingIds: {},
}

export type ScanSessionEvent =
  /** The camera's gallery button: a fresh pick clears a bad-photo message. */
  | { type: 'libraryOpened' }
  /** Every "Scan again" / "Not this one": the answer is set aside and the camera returns. */
  | { type: 'backToCamera' }
  /** An after-scan nudge (J): back to the camera, titled for the part asked for. */
  | { type: 'nudged'; kind: NudgeKind }
  /** A photo came from the shutter or the library and is being downscaled. */
  | { type: 'photoTaken'; photoUrl: string }
  /** The photo could not be decoded. */
  | { type: 'photoUnreadable' }
  /** The downscaled photo went to the scan; `token` names this send for its slow timer. */
  | { type: 'photoSent'; token: number }
  /** "Send again" / "Send now": the same photo, unchanged. */
  | { type: 'resent'; token: number }
  /** {@link SCAN_SLOW_MS} passed since the send `token` named. */
  | { type: 'slowTimerFired'; token: number }
  /** The scan answered (any answer, even a refusal: the network delivered it). */
  | { type: 'answered' }
  /** The scan did not answer: no connection, a timeout, or the visitor's Cancel. */
  | { type: 'unanswered'; failure: ConnectionFailure }
  /** §5a → §7: "Rank these for you". */
  | { type: 'listOpened'; kind: ListKind }
  /** Back from §7 to the outcome it was opened from. */
  | { type: 'listClosed' }
  /** #408: the answer `read` is too old to pair the next photo with. */
  | { type: 'readExpired'; read: ScanActionState }
  /** The camera's "Don't": the next photo is of another bottle, so `read` is let go now. */
  | { type: 'pairingDeclined'; read: ScanActionState }
  /** "Not this bottling? All {line} bottlings": `key` is `photoUrl|bottlingId`. */
  | { type: 'allBottlingsShown'; key: string | null }
  /** The "Log as" choice: `anyBottlingFor` is the photo it was made for, or `null` for the label's bottling. */
  | { type: 'loggedAs'; anyBottlingFor: string | null }
  /** The label's bottling was created at the first rating or bottle added. */
  | { type: 'labelBottlingCreated'; key: string; id: string }

export function scanSessionReducer(session: ScanSession, event: ScanSessionEvent): ScanSession {
  switch (event.type) {
    case 'libraryOpened':
      return { ...session, downscaleFailed: false }
    case 'backToCamera':
      return {
        ...session,
        connectionFailure: null,
        askedFor: null,
        listOpen: null,
        dismissed: true,
        photoUrl: null,
        downscaleFailed: false,
      }
    case 'nudged':
      return { ...scanSessionReducer(session, { type: 'backToCamera' }), askedFor: event.kind }
    case 'photoTaken':
      return {
        ...session,
        downscaleFailed: false,
        connectionFailure: null,
        askedFor: null,
        // A new attempt supersedes whatever the visitor dismissed to get here.
        dismissed: false,
        downscaling: true,
        photoUrl: event.photoUrl,
      }
    case 'photoUnreadable':
      return { ...session, downscaleFailed: true, downscaling: false }
    case 'photoSent':
      return { ...session, offlineTries: 0, sending: { token: event.token, slow: false }, downscaling: false }
    case 'resent':
      return { ...session, connectionFailure: null, dismissed: false, sending: { token: event.token, slow: false } }
    case 'slowTimerFired':
      return session.sending?.token === event.token ? { ...session, sending: { token: event.token, slow: true } } : session
    case 'answered':
      return session.offlineTries === 0 ? session : { ...session, offlineTries: 0 }
    case 'unanswered':
      return {
        ...session,
        connectionFailure: event.failure,
        offlineTries: event.failure === 'offline' ? session.offlineTries + 1 : session.offlineTries,
      }
    case 'listOpened':
      return { ...session, listOpen: event.kind }
    case 'listClosed':
      return { ...session, listOpen: null }
    case 'readExpired':
      return { ...session, expired: event.read }
    case 'pairingDeclined':
      return { ...session, expired: event.read, askedFor: null }
    case 'allBottlingsShown':
      return { ...session, lineViewFor: event.key }
    case 'loggedAs':
      return { ...session, anyBottlingFor: event.anyBottlingFor }
    case 'labelBottlingCreated':
      return { ...session, labelBottlingIds: { ...session.labelBottlingIds, [event.key]: event.id } }
  }
}

/** A read in the browser or on the server: the camera shows "Reading the label…". */
export function isWorking(session: ScanSession, isActionPending: boolean): boolean {
  return session.downscaling || isActionPending
}

/**
 * What the screen shows, as opposed to what the action last returned.
 *
 * They diverge when the visitor tapped "Scan again" and is back at the
 * viewfinder (`useActionState` has no reset, so the dismissed answer is still
 * in `state`); while a read is in flight (§4's "capture → working → result":
 * the frame holds the still rather than the old answer, faded); and when the
 * network lost the scan, whose screen is the camera with the photo. Deriving
 * the whole view from one value makes a half-dismissal — the viewfinder back
 * underneath the card it was meant to replace — impossible.
 */
export function shownState(session: ScanSession, state: ScanActionState, isActionPending: boolean): ScanActionState {
  return session.dismissed || isWorking(session, isActionPending) || session.connectionFailure
    ? INITIAL_SCAN_ACTION_STATE
    : state
}

/** #408: what the next photo may be resolved together with, unless the read has gone stale. */
export function earlierReadFor(session: ScanSession, state: ScanActionState): EarlierScanRead | null {
  return state === session.expired ? null : earlierReadOf(state)
}

/**
 * Design v1.9 S4 and S5, said on the camera: a read past 10 s, or a photo the
 * network lost. `back` is "Connection is back · Send now"; `still` is the
 * "Still no connection" line under a second offline send.
 */
export type CameraStatus =
  | { kind: 'slow' }
  | { kind: 'offline'; back: boolean; still: boolean }
  | { kind: 'timed_out' }

export function cameraStatus(
  session: ScanSession,
  { isActionPending, online }: { isActionPending: boolean; online: boolean },
): CameraStatus | null {
  if (isActionPending && session.sending?.slow) return { kind: 'slow' }
  if (!session.connectionFailure || isWorking(session, isActionPending)) return null
  if (session.connectionFailure === 'offline') {
    const back = online && session.offlineTries > 0
    return { kind: 'offline', back, still: !back && session.offlineTries > 1 }
  }
  return { kind: 'timed_out' }
}
