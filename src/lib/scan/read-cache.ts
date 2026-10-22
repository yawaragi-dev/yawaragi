import type { ScanActionState } from './scan-action-state'

/**
 * A scan's answer kept for ten minutes (design v1.9, S4): a photo sent again
 * after its answer was lost on the way back — a timeout, a Cancel, a dead
 * signal on the return trip — gets the stored answer, with no second model
 * call and no second scan off the visitor's free ones.
 *
 * Keyed by a SHA-256 over the visitor's session id, the locale, the earlier
 * read it was sent with and the photo's bytes, so only the same visitor
 * sending the same photo the same way gets it back. Stored: the answer as
 * the catalogue resolved it, before the visitor's own bottlings are looked
 * up (those are read fresh every time). Never the photo. Upstash, TTL 600 s.
 */
export const READ_CACHE_TTL_SEC = 600

/** Answers worth keeping: what the model read. Not limits, errors or bad input. */
const KEPT: ReadonlySet<ScanActionState['status']> = new Set([
  'matched',
  'matched_brand_only',
  'matched_brewery_only',
  'ambiguous',
  'low_confidence',
  'no_match',
  'not_sake',
  'not_one_bottle',
])

export function isWorthKeeping(state: ScanActionState): boolean {
  return KEPT.has(state.status)
}

export async function readCacheKey(parts: {
  sid: string
  locale: string
  earlierRead: unknown
  image: Blob
}): Promise<string> {
  const head = new TextEncoder().encode(`${parts.sid}\n${parts.locale}\n${JSON.stringify(parts.earlierRead ?? null)}\n`)
  const body = new Uint8Array(await parts.image.arrayBuffer())
  const all = new Uint8Array(head.length + body.length)
  all.set(head)
  all.set(body, head.length)
  const digest = await crypto.subtle.digest('SHA-256', all)
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  return `scanread:${hex}`
}

export interface ReadCache {
  get(key: string): Promise<ScanActionState | null>
  set(key: string, state: ScanActionState): Promise<void>
}

/**
 * Upstash over REST. Every failure reads as a miss or a skipped write: the
 * cache saves money and a scan, it never stands between a visitor and an
 * answer.
 */
export function upstashReadCache({
  restUrl,
  restToken,
  fetchImpl = fetch,
}: {
  restUrl: string
  restToken: string
  fetchImpl?: typeof fetch
}): ReadCache {
  const call = async (command: unknown[]) => {
    const response = await fetchImpl(restUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${restToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`upstash ${response.status}`)
    return (await response.json()) as { result: unknown }
  }
  return {
    async get(key) {
      try {
        const { result } = await call(['GET', key])
        return typeof result === 'string' ? (JSON.parse(result) as ScanActionState) : null
      } catch {
        return null
      }
    },
    async set(key, state) {
      if (!isWorthKeeping(state)) return
      try {
        await call(['SET', key, JSON.stringify(state), 'EX', READ_CACHE_TTL_SEC])
      } catch {
        // A lost write is a lost discount, nothing more.
      }
    },
  }
}
