'use client'

import { useSyncExternalStore } from 'react'
import {
  getConsensusFromHistory,
  SCAN_HISTORY_CHANGE_EVENT,
  type ConsensusMatch,
} from './scan-history'

/**
 * Reactive accessor for the per-tab scan-history consensus. Returns
 * the current `ConsensusMatch` (if a strict-majority brand is in the
 * history) or `null`. Re-renders the subscribing component whenever
 * the history changes — either by another component appending a new
 * match (we dispatch our own `SCAN_HISTORY_CHANGE_EVENT`) or by a
 * cross-tab `storage` event (defensive, even though we don't share
 * history across tabs today).
 *
 * Server snapshot is always `null` — the consensus only exists in the
 * browser tab's sessionStorage. That matches the contract:
 * `getConsensusFromHistory` returns `null` for `typeof window ===
 * 'undefined'` too.
 */
export function useScanHistoryConsensus(): ConsensusMatch | null {
  return useSyncExternalStore(subscribe, getConsensusFromHistory, () => null)
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = () => onChange()
  window.addEventListener(SCAN_HISTORY_CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(SCAN_HISTORY_CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}
