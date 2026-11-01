'use client'

import { startTransition, useActionState, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import type { Locale } from '@/i18n/routing'
import {
  browserIsOnline,
  settleRequest,
  subscribeOnline,
  type ConnectionFailure,
} from '@/lib/network/settle-request'
import { EARLIER_READ_TTL_MS } from './earlier-read'
import { INITIAL_LIST_ACTION_STATE, type ListActionState } from './list-action-state'
import { INITIAL_SCAN_ACTION_STATE, type ScanActionState } from './scan-action-state'
import {
  INITIAL_SCAN_SESSION,
  SCAN_SLOW_MS,
  SCAN_TIMEOUT_MS,
  cameraStatus,
  earlierReadFor,
  isWorking,
  scanSessionReducer,
  shownState,
  type ListKind,
} from './scan-session'

interface UseScanSessionOptions {
  locale: Locale
  /**
   * Sends one scan (`fetchScan`); passed in so a test can answer it. `signal`
   * is aborted when the visitor cancels or the 30 s stop fires.
   */
  scan: (formData: FormData, signal: AbortSignal) => Promise<ScanActionState>
  /** §7's list read (`readListAction`). */
  readList: (previous: ListActionState, formData: FormData) => Promise<ListActionState>
  /** Told when a scan did not come back, for the debug panel. */
  onUnanswered?: (failure: ConnectionFailure) => void
}

/**
 * The scan screen's session, wired to the world: the scan request and §7's
 * Server Action, the
 * rule-16 timers (10 s "Taking longer than usual", the 30 s stop, the
 * five-minute life of a read for pairing the next photo), the browser's
 * online and offline events, and the `blob:` URL of the visitor's photo.
 * Each of them becomes an event for `scanSessionReducer`; the screen reads
 * the result and renders.
 */
export function useScanSession({ locale, scan, readList, onUnanswered }: UseScanSessionOptions) {
  const [session, dispatch] = useReducer(scanSessionReducer, INITIAL_SCAN_SESSION)
  /** What the last scan sent, for "Send again" to send unchanged. */
  const lastScanFormRef = useRef<FormData | null>(null)
  const sendTokenRef = useRef(0)
  /** Stops waiting for the read in flight and ends its request (S4's Cancel). */
  const cancelScanRef = useRef<(() => void) | null>(null)
  /**
   * The downscaled photo last sent to the scan, for "Rank these for you" to
   * send again. Memory only, like the preview: the server keeps no photo
   * between the two calls (ADR-0009).
   */
  const photoBlobRef = useRef<Blob | null>(null)
  /** The photo `listState` was read from. */
  const listReadFor = useRef<Blob | null>(null)
  const online = useSyncExternalStore(subscribeOnline, browserIsOnline, () => true)

  // The scan's answer, kept by hand rather than by `useActionState`: a Server
  // Action cannot be aborted, and React kept the screen pending until a
  // cancelled one came back, with every resend queued behind it.
  const [state, setState] = useState<ScanActionState>(INITIAL_SCAN_ACTION_STATE)
  /** The send in flight, by token; `null` when none is. */
  const [inFlight, setInFlight] = useState<number | null>(null)
  const isActionPending = inFlight !== null
  /** A server error from the scan, rethrown in render for the error page. */
  const [scanError, setScanError] = useState<unknown>(null)
  if (scanError) throw scanError

  async function runScan(formData: FormData, token: number) {
    const controller = new AbortController()
    const cancelled = new Promise<void>((resolve) => {
      cancelScanRef.current = resolve
    })
    setInFlight(token)
    let settled
    try {
      settled = await settleRequest(scan(formData, controller.signal), {
        timeoutMs: SCAN_TIMEOUT_MS,
        isOnline: browserIsOnline,
        cancelled,
      })
    } catch (error) {
      if (sendTokenRef.current === token) setScanError(error)
      return
    } finally {
      // Ends a request given up on (Cancel, the 30 s stop); a no-op once it answered.
      controller.abort()
    }
    // A later send replaced this one: its answer, or its failure, is not the screen's any more.
    if (sendTokenRef.current !== token) return
    cancelScanRef.current = null
    setInFlight(null)
    if (settled.ok) {
      dispatch({ type: 'answered' })
      setState(settled.value)
      return
    }
    onUnanswered?.(settled.failure)
    // The answer before stays, so a resend still pairs with its read.
    dispatch({ type: 'unanswered', failure: settled.failure })
  }
  // §7: the whole menu or shelf, read from the same photo on request. A list
  // that could not be read for the network says so the way any other failed
  // read does.
  const [listState, listFormAction, isListPending] = useActionState<ListActionState, FormData>(
    async (previous, formData) => {
      const settled = await settleRequest(readList(previous, formData), {
        timeoutMs: SCAN_TIMEOUT_MS,
        isOnline: browserIsOnline,
      })
      return settled.ok ? settled.value : { status: 'failed' }
    },
    INITIAL_LIST_ACTION_STATE,
  )

  // ADR-0015 / #163: the in-place result card shows the visitor's own label
  // photo, from a `blob:` URL of the ORIGINAL file that never leaves the
  // browser. Revoked when it is replaced or cleared (React runs this cleanup
  // with the previous URL closed over) and when the screen unmounts: the
  // single point of `revokeObjectURL`.
  const { photoUrl } = session
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  // #408: a read is usable for the next photo for a few minutes only.
  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: 'readExpired', read: state }), EARLIER_READ_TTL_MS)
    return () => clearTimeout(timer)
  }, [state])

  const earlierRead = earlierReadFor(session, state)

  /**
   * Send a scan — a new photo, or the same one again — and start the clock
   * for "Taking longer than usual".
   */
  function send(formData: FormData, how: 'photoSent' | 'resent') {
    const token = ++sendTokenRef.current
    dispatch({ type: how, token })
    window.setTimeout(() => dispatch({ type: 'slowTimerFired', token }), SCAN_SLOW_MS)
    // A resend while an earlier read is still on its way supersedes it.
    cancelScanRef.current?.()
    void runScan(formData, token)
  }

  return {
    session,
    dispatch,
    /** The action's last answer; see `view` for what the screen shows. */
    state,
    isActionPending,
    /** A read in the browser or on the server. */
    isPending: isWorking(session, isActionPending),
    view: shownState(session, state, isActionPending),
    cameraStatus: cameraStatus(session, { isActionPending, online }),
    earlierRead,
    listState,
    isListPending,

    /** A photo from the shutter or the library, about to be downscaled. */
    photoTaken(file: File) {
      dispatch({ type: 'photoTaken', photoUrl: URL.createObjectURL(file) })
    },

    /** The downscaled photo, sent with what the last scan read (#408). */
    sendPhoto(photo: Blob) {
      photoBlobRef.current = photo
      const formData = new FormData()
      formData.set('image', photo, 'label.jpg')
      formData.set('locale', locale)
      // #408: what the last scan read, so a photo of another side can be
      // resolved with both. The server reads this photo blind and uses the
      // earlier read only if this one finds no single sake by itself.
      if (earlierRead) formData.set('earlierRead', JSON.stringify(earlierRead))
      lastScanFormRef.current = formData
      send(formData, 'photoSent')
    },

    /** "Send again" after a scan the network lost: the same photo, unchanged. */
    sendAgain() {
      const formData = lastScanFormRef.current
      if (!formData) return
      send(formData, 'resent')
    },

    /** S4's Cancel: stop waiting for the read in flight, and end its request. */
    cancel() {
      cancelScanRef.current?.()
    },

    /** §5a → §7: read the whole list in the photo just scanned. */
    rank(kind: ListKind) {
      const photo = photoBlobRef.current
      if (!photo) return
      dispatch({ type: 'listOpened', kind })
      // Back from the list and "Rank these" again: the same photo was read
      // already, and reading it twice pays twice for the same answer.
      if (listReadFor.current === photo && listState.status === 'read') return
      listReadFor.current = photo
      const formData = new FormData()
      formData.set('image', photo, 'list.jpg')
      formData.set('kind', kind)
      formData.set('locale', locale)
      startTransition(() => listFormAction(formData))
    },
  }
}
