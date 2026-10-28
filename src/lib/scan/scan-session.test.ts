import { describe, expect, it } from 'vitest'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import { INITIAL_SCAN_ACTION_STATE, type ScanActionState } from './scan-action-state'
import {
  INITIAL_SCAN_SESSION,
  cameraStatus,
  earlierReadFor,
  scanSessionReducer,
  shownState,
  type ScanSession,
  type ScanSessionEvent,
} from './scan-session'

const extraction: LabelScanExtraction = {
  name_ja: '人気一',
  brewery_ja: '人気酒造',
  other_names: [],
  confidence: 0.7,
  source: 'llm_extracted',
}
const noMatch: ScanActionState = { status: 'no_match', extraction, candidates: [] }

/** Runs events from the start of a session (or from `from`). */
const run = (events: ScanSessionEvent[], from: ScanSession = INITIAL_SCAN_SESSION) =>
  events.reduce(scanSessionReducer, from)

/** A photo taken and sent as send 1. */
const SENT: ScanSessionEvent[] = [
  { type: 'photoTaken', photoUrl: 'blob:1' },
  { type: 'photoSent', token: 1 },
]

describe('the rule-16 clock for a scan in flight', () => {
  it.each([
    { what: 'says nothing extra while the read is young', events: SENT, pending: true, status: null },
    {
      what: 'says "Taking longer than usual" once 10 s pass',
      events: [...SENT, { type: 'slowTimerFired', token: 1 }],
      pending: true,
      status: { kind: 'slow' },
    },
    {
      what: 'ignores the slow timer of an earlier send',
      events: [...SENT, { type: 'photoSent', token: 2 }, { type: 'slowTimerFired', token: 1 }],
      pending: true,
      status: null,
    },
    {
      what: 'drops the slow line as soon as the answer is in',
      events: [...SENT, { type: 'slowTimerFired', token: 1 }, { type: 'answered' }],
      pending: false,
      status: null,
    },
    {
      what: 'keeps the slow line while a cancelled read is still settling',
      events: [...SENT, { type: 'slowTimerFired', token: 1 }, { type: 'unanswered', failure: 'timed_out' }],
      pending: true,
      status: { kind: 'slow' },
    },
    {
      what: 'offers "Send again" once a cancelled or timed-out read has settled',
      events: [...SENT, { type: 'slowTimerFired', token: 1 }, { type: 'unanswered', failure: 'timed_out' }],
      pending: false,
      status: { kind: 'timed_out' },
    },
  ] satisfies { what: string; events: ScanSessionEvent[]; pending: boolean; status: unknown }[])(
    '$what',
    ({ events, pending, status }) => {
      expect(cameraStatus(run(events), { isActionPending: pending, online: true })).toEqual(status)
    },
  )
})

describe('a scan the network lost', () => {
  const offline: ScanSessionEvent = { type: 'unanswered', failure: 'offline' }

  it.each([
    {
      what: 'says "No connection" with the photo kept',
      events: [...SENT, offline],
      online: false,
      status: { kind: 'offline', back: false, still: false },
    },
    {
      what: 'says "Still no connection" after a second send finds none',
      events: [...SENT, offline, { type: 'resent', token: 2 }, offline],
      online: false,
      status: { kind: 'offline', back: false, still: true },
    },
    {
      what: 'says "Connection is back · Send now" once the browser is online again',
      events: [...SENT, offline, { type: 'resent', token: 2 }, offline],
      online: true,
      status: { kind: 'offline', back: true, still: false },
    },
    {
      what: 'says nothing while "Send now" is on its way',
      events: [...SENT, offline, { type: 'resent', token: 2 }],
      online: true,
      status: null,
    },
    {
      what: 'is gone once the resend answers',
      events: [...SENT, offline, { type: 'resent', token: 2 }, { type: 'answered' }],
      online: true,
      status: null,
    },
  ] satisfies { what: string; events: ScanSessionEvent[]; online: boolean; status: unknown }[])(
    '$what',
    ({ events, online, status }) => {
      expect(cameraStatus(run(events), { isActionPending: false, online })).toEqual(status)
    },
  )

  it('starts counting again for a new photo', () => {
    const session = run([...SENT, offline, { type: 'resent', token: 2 }, offline, ...SENT])
    expect(session.offlineTries).toBe(0)
    expect(session.connectionFailure).toBeNull()
  })

  it('draws the camera, not the answer before it, while the photo waits to be sent again', () => {
    const session = run([...SENT, offline])
    expect(shownState(session, noMatch, false)).toBe(INITIAL_SCAN_ACTION_STATE)
  })

  it('keeps the read before it for the resend to pair with', () => {
    expect(earlierReadFor(run([...SENT, offline]), noMatch)?.name_ja).toBe('人気一')
  })

  it('is cleared by "Scan again", which starts from the camera', () => {
    const session = run([...SENT, offline, { type: 'backToCamera' }])
    expect(cameraStatus(session, { isActionPending: false, online: true })).toBeNull()
    expect(session.photoUrl).toBeNull()
  })
})

describe('what the screen shows', () => {
  it('shows the answer once it is in', () => {
    expect(shownState(run([...SENT, { type: 'answered' }]), noMatch, false)).toBe(noMatch)
  })

  it('shows the camera with the new still while a photo is downscaled, not the last answer', () => {
    const session = run([{ type: 'photoTaken', photoUrl: 'blob:2' }])
    expect(shownState(session, noMatch, false)).toBe(INITIAL_SCAN_ACTION_STATE)
    expect(session.photoUrl).toBe('blob:2')
  })

  it('shows the camera while the read is in flight', () => {
    expect(shownState(run(SENT), noMatch, true)).toBe(INITIAL_SCAN_ACTION_STATE)
  })

  it('shows the camera after "Scan again", though the action still holds the answer', () => {
    expect(shownState(run([...SENT, { type: 'answered' }, { type: 'backToCamera' }]), noMatch, false)).toBe(
      INITIAL_SCAN_ACTION_STATE,
    )
  })

  it('shows the next answer after "Scan again" and a new photo', () => {
    const session = run([...SENT, { type: 'answered' }, { type: 'backToCamera' }, ...SENT, { type: 'answered' }])
    expect(shownState(session, noMatch, false)).toBe(noMatch)
  })

  it('says a photo that could not be decoded is a bad photo, and a fresh pick clears it', () => {
    const failed = run([{ type: 'photoTaken', photoUrl: 'blob:1' }, { type: 'photoUnreadable' }])
    expect(failed).toMatchObject({ downscaleFailed: true, downscaling: false })
    expect(scanSessionReducer(failed, { type: 'libraryOpened' }).downscaleFailed).toBe(false)
  })
})

describe('a second photo of the same bottle', () => {
  it('is read together with the answer on screen', () => {
    expect(earlierReadFor(INITIAL_SCAN_SESSION, noMatch)).toMatchObject({ name_ja: '人気一' })
  })

  it('is read alone once the answer has gone stale', () => {
    const session = run([{ type: 'readExpired', read: noMatch }])
    expect(earlierReadFor(session, noMatch)).toBeNull()
  })

  it('is read with a newer answer even after an older one went stale', () => {
    const session = run([{ type: 'readExpired', read: noMatch }])
    expect(earlierReadFor(session, { ...noMatch })).not.toBeNull()
  })

  it('is read alone when the visitor says "Don\'t", which also drops what the nudge asked for', () => {
    const session = run([
      { type: 'nudged', kind: 'side' },
      { type: 'pairingDeclined', read: noMatch },
    ])
    expect(earlierReadFor(session, noMatch)).toBeNull()
    expect(session.askedFor).toBeNull()
  })

  it('opens the camera titled for the side a nudge asked for, until the photo is taken', () => {
    const nudged = run([...SENT, { type: 'answered' }, { type: 'nudged', kind: 'sticker' }])
    expect(nudged).toMatchObject({ askedFor: 'sticker', dismissed: true, photoUrl: null })
    expect(scanSessionReducer(nudged, { type: 'photoTaken', photoUrl: 'blob:2' }).askedFor).toBeNull()
  })
})

describe('the menu and shelf list', () => {
  it('opens for its kind and closes back to the outcome', () => {
    const open = run([{ type: 'listOpened', kind: 'shelf' }])
    expect(open.listOpen).toBe('shelf')
    expect(scanSessionReducer(open, { type: 'listClosed' }).listOpen).toBeNull()
  })

  it('closes when the visitor retakes the photo from it', () => {
    expect(run([{ type: 'listOpened', kind: 'menu' }, { type: 'backToCamera' }]).listOpen).toBeNull()
  })
})

describe('which bottling the bottle in hand is logged as', () => {
  it('remembers the bottlings created from a label, beside the earlier ones', () => {
    const session = run([
      { type: 'labelBottlingCreated', key: '1|Junmai', id: 'a' },
      { type: 'labelBottlingCreated', key: '2|Nama', id: 'b' },
    ])
    expect(session.labelBottlingIds).toEqual({ '1|Junmai': 'a', '2|Nama': 'b' })
  })

  it('remembers "any bottling" and "all bottlings" for the photo they were said for', () => {
    const session = run([
      { type: 'loggedAs', anyBottlingFor: 'blob:1' },
      { type: 'allBottlingsShown', key: 'blob:1|own-1' },
    ])
    expect(session).toMatchObject({ anyBottlingFor: 'blob:1', lineViewFor: 'blob:1|own-1' })
  })
})
