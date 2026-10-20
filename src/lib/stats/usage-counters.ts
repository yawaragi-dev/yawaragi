/**
 * First-party usage counters (#454 §6): how many scans, searches, tastings
 * and so on happen each day — plain totals, nothing about who.
 *
 * One Redis hash per day and environment, `stats:<scope>:<YYYY-MM-DD>`, field
 * = event name, value = count. No visitor id, IP, cookie value or query text
 * is ever part of a key or a field, so a tally is not personal data and needs
 * no consent (ADR-0009, "Aggregate usage counters"). The scope keeps preview
 * builds and local runs, which share the Upstash database today (#481), out
 * of the live site's numbers.
 *
 * Not `server-only`, so `scripts/usage-stats.ts` can read the tallies; the
 * app records through `count-usage.ts`.
 */

/** About thirteen months: a year back plus the month being compared. */
const RETENTION_SECONDS = 400 * 24 * 60 * 60

export type UsageEvent =
  | 'visit'
  | 'age_gate_accepted'
  | 'search'
  | 'browse'
  | 'suggest'
  | 'list_read'
  | 'tasting_rated'
  | 'cellar_added'
  | 'bottling_added'
  | 'sample_opened'
  | `scan:${string}`

export interface UpstashTarget {
  restUrl: string
  restToken: string
  fetchImpl?: typeof fetch
}

export function usageKey(scope: string, day: Date): string {
  return `stats:${scope}:${day.toISOString().slice(0, 10)}`
}

/** Adds one to `event` in today's tally. Never throws: a lost count is fine. */
export async function recordUsageEvent(
  event: UsageEvent,
  target: UpstashTarget & { scope: string; now?: Date },
): Promise<void> {
  const key = usageKey(target.scope, target.now ?? new Date())
  try {
    const response = await (target.fetchImpl ?? fetch)(`${target.restUrl}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${target.restToken}`, 'content-type': 'application/json' },
      body: JSON.stringify([
        ['HINCRBY', key, event, '1'],
        ['EXPIRE', key, String(RETENTION_SECONDS)],
      ]),
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Upstash REST error ${response.status}`)
  } catch (error) {
    console.warn('[yawaragi:stats]', JSON.stringify({ event, error: String(error) }))
  }
}

/** One day's tally as `{ event: count }`; `{}` for a day with none. */
export async function readUsageCounts(scope: string, day: Date, target: UpstashTarget): Promise<Record<string, number>> {
  const response = await (target.fetchImpl ?? fetch)(target.restUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${target.restToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(['HGETALL', usageKey(scope, day)]),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Upstash REST error ${response.status}`)
  const { result } = (await response.json()) as { result: unknown }
  const counts: Record<string, number> = {}
  if (!Array.isArray(result)) return counts
  for (let i = 0; i + 1 < result.length; i += 2) {
    counts[String(result[i])] = Number(result[i + 1]) || 0
  }
  return counts
}
