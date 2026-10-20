/**
 * `pnpm stats` — the usage counters (#454 §6) as a table: one row per event,
 * one column per day, newest day first. Plain totals; nothing about anyone.
 *
 *   pnpm stats                       # production, last 7 days
 *   pnpm stats -- --days 30
 *   pnpm stats -- --scope preview    # or local
 *
 * Reads the Upstash database in `.env.local`. Read-only.
 */
import { readUsageCounts } from '@/lib/stats/usage-counters'

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const restUrl = process.env.UPSTASH_REDIS_REST_URL
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!restUrl || !restToken) throw new Error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN')
  const scope = flag('scope') ?? 'production'
  const days = Math.max(1, Math.min(90, Number(flag('days') ?? 7) || 7))

  const dates = Array.from({ length: days }, (_, i) => new Date(Date.now() - i * 24 * 60 * 60 * 1000))
  const tallies = await Promise.all(dates.map((day) => readUsageCounts(scope, day, { restUrl, restToken })))
  const events = [...new Set(tallies.flatMap((tally) => Object.keys(tally)))].sort()
  if (events.length === 0) {
    console.log(`No counts for "${scope}" in the last ${days} day(s).`)
    return
  }

  const width = Math.max(...events.map((e) => e.length), 5)
  const header = ['event'.padEnd(width), ...dates.map((d) => d.toISOString().slice(5, 10))].join('  ')
  console.log(`${scope}, last ${days} day(s), UTC\n`)
  console.log(header)
  for (const event of events) {
    console.log([event.padEnd(width), ...tallies.map((t) => String(t[event] ?? 0).padStart(5))].join('  '))
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
