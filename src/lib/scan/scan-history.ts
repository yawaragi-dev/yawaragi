/**
 * Per-tab scan-history store.
 *
 * Captures every successful match (`matched` or `matched_brand_only`)
 * so the form can surface a "based on your recent scans, this looks
 * like X" consensus card when a subsequent scan lands in retry /
 * low-confidence and a strict majority of recent history points to
 * the same brand.
 *
 * Storage: `sessionStorage` under a single key holding a JSON array
 * of entries. Per-tab, ephemeral (cleared when the tab closes), and
 * never crosses an origin. Not subject to consent banner or GDPR
 * processing — it's pure UI state, not personal data, lawful basis
 * Art. 6(1)(f) legitimate interest in UX continuity within a single
 * tab session. See ADR-0009 §"Per-PR GDPR review questions" — no
 * new processing operation here.
 *
 * The module is callable from both client and (no-op safely on)
 * server contexts — `sessionStorage` access is feature-gated via a
 * `typeof window === 'undefined'` short-circuit so module import in
 * a Server Component or test env doesn't throw.
 */

const STORAGE_KEY = 'yawaragi_scan_history'
const HISTORY_CAP = 10

export interface ScanHistoryEntry {
  /** Sakenowa brand id the visitor's match resolved to. */
  brandId: number
  /** Locale-aware href for the sake page — already computed by the action. */
  sakeHref: string
  /** Brand kanji at match time (display only). */
  nameKanji: string
  /** Wall-clock ms when the match was appended. */
  tMs: number
}

export interface ConsensusMatch {
  brandId: number
  sakeHref: string
  nameKanji: string
  /** How many entries in `entries` resolved to this `brandId`. */
  votes: number
  /** Total entries considered. `votes > total / 2` is the consensus condition. */
  total: number
}

/**
 * Strict-majority consensus over the history: returns the brand if and
 * only if more than half of the recent entries resolved to the same
 * `brandId`. With our 10-entry cap, that's at least 6 of 10, 4 of 7, 3
 * of 5, 2 of 3 — never 1 of 2 (a tie isn't a majority).
 *
 * `sakeHref` and `nameKanji` are pulled from the *latest* entry that
 * voted for the winning brand, so the displayed kanji + URL reflect
 * the freshest extraction (in case the kanji rendering drifted across
 * variants).
 */
export function getConsensusFromHistory(): ConsensusMatch | null {
  const entries = readHistory()
  if (entries.length < 2) return null

  const counts = new Map<number, number>()
  for (const entry of entries) {
    counts.set(entry.brandId, (counts.get(entry.brandId) ?? 0) + 1)
  }

  let winnerId: number | null = null
  let winnerVotes = 0
  for (const [brandId, votes] of counts) {
    if (votes > winnerVotes) {
      winnerId = brandId
      winnerVotes = votes
    }
  }

  if (winnerId === null) return null
  if (winnerVotes * 2 <= entries.length) return null // strict majority

  const latestForWinner = [...entries].reverse().find((e) => e.brandId === winnerId)
  if (!latestForWinner) return null

  return {
    brandId: winnerId,
    sakeHref: latestForWinner.sakeHref,
    nameKanji: latestForWinner.nameKanji,
    votes: winnerVotes,
    total: entries.length,
  }
}

/**
 * Append a successful match to the per-tab history. Capped at
 * `HISTORY_CAP` entries (oldest dropped). Idempotent against a tab
 * session that's already been cleared — no error if storage is
 * unavailable, just a silent no-op.
 *
 * Fires a `storage`-style event via `dispatchEvent` so a parallel
 * `useSyncExternalStore` subscriber in the same tab re-renders — the
 * native `storage` event doesn't fire on the writing tab, so we
 * synthesise a CustomEvent that the hook listens to.
 */
export function appendMatchToHistory(entry: ScanHistoryEntry): void {
  if (typeof window === 'undefined') return
  try {
    const entries = readHistory()
    entries.push(entry)
    const trimmed = entries.slice(-HISTORY_CAP)
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    window.dispatchEvent(new CustomEvent(SCAN_HISTORY_CHANGE_EVENT))
  } catch {
    // sessionStorage can throw in private-browsing modes or when the
    // quota is exceeded. Silent no-op — the consensus feature is
    // additive UX and shouldn't break the scan flow.
  }
}

/**
 * Clear all history for this tab. Not currently wired into UI;
 * exported for the debug overlay / future "forget my scans" action.
 */
export function clearScanHistory(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
    window.dispatchEvent(new CustomEvent(SCAN_HISTORY_CHANGE_EVENT))
  } catch {
    /* no-op */
  }
}

/**
 * Custom-event name used to notify in-tab subscribers (the
 * `useScanHistoryConsensus` hook) that the history changed. The
 * native `storage` event only fires across tabs, not within the
 * writing tab.
 */
export const SCAN_HISTORY_CHANGE_EVENT = 'yawaragi:scan-history-change'

function readHistory(): ScanHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isScanHistoryEntry)
  } catch {
    return []
  }
}

function isScanHistoryEntry(value: unknown): value is ScanHistoryEntry {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.brandId === 'number' &&
    typeof v.sakeHref === 'string' &&
    typeof v.nameKanji === 'string' &&
    typeof v.tMs === 'number'
  )
}
