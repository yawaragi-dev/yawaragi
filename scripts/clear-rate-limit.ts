/**
 * Maintainer utility — wipe the anonymous rate-limit budget so the next scan
 * starts fresh. Useful when testing the scan flow on a preview deploy hits
 * the 5-call/24h cap. (Signed in as a maintainer, the limits do not apply at
 * all — `docs/manual-testing.md` — which is usually the better way.)
 *
 * Usage:
 *   pnpm rate-limit:reset                          # every bucket, asks first
 *   pnpm rate-limit:reset -- --bucket vision-scan  # one bucket
 *   pnpm rate-limit:reset -- --yes                 # no question (scripts, CI)
 *
 * **It resets every visitor's budget, not just yours (#119).** The keys are
 * `rl:<bucket>:cookie:<sid>` and `rl:<bucket>:ip:<hashedIp>`; neither can be
 * worked out from a terminal, so there is no "just mine". Before deleting,
 * it says how many keys and visitors that is and asks. Point it at the
 * Upstash database of the environment you mean: if Preview and Production
 * share one, this clears Production's budgets too.
 *
 * Reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. The same
 * database holds the maintainer's journal, cellar and bottlings (ADR-0024):
 * only `rl:` keys are ever matched, and they are found with SCAN, not KEYS,
 * so a large database is not blocked while it looks.
 */
import { createInterface } from 'node:readline/promises'

export interface ResetArgs {
  bucket: string | null
  yes: boolean
}

export function parseResetArgs(argv: readonly string[]): ResetArgs {
  const args: ResetArgs = { bucket: null, yes: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--yes' || arg === '-y') args.yes = true
    else if (arg === '--bucket') {
      const value = argv[++i]
      if (!value || !/^[a-z0-9-]+$/.test(value)) throw new Error('--bucket takes a bucket name, e.g. vision-scan')
      args.bucket = value
    } else throw new Error(`Unknown argument: ${arg}`)
  }
  return args
}

/** The pattern SCAN matches: one bucket, or every rate-limit key. */
export function keyPattern(bucket: string | null): string {
  return bucket ? `rl:${bucket}:*` : 'rl:*'
}

/**
 * What deleting these keys would reset, in words the question can use: how
 * many keys per bucket, and how many visitors (each has a cookie key and an
 * IP key, so visitors are counted by cookie id).
 */
export function summariseKeys(keys: readonly string[]): { bucket: string; keys: number; visitors: number }[] {
  const byBucket = new Map<string, { keys: number; cookies: Set<string> }>()
  for (const key of keys) {
    const [, bucket = '?', kind, ...rest] = key.split(':')
    const entry = byBucket.get(bucket) ?? { keys: 0, cookies: new Set<string>() }
    entry.keys++
    if (kind === 'cookie') entry.cookies.add(rest.join(':'))
    byBucket.set(bucket, entry)
  }
  return [...byBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, { keys: count, cookies }]) => ({ bucket, keys: count, visitors: cookies.size }))
}

async function main(): Promise<void> {
  const args = parseResetArgs(process.argv.slice(2))
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    console.error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. ' +
        'Add both to .env.local (copy from Upstash dashboard → REST API tab) and rerun.',
    )
    process.exitCode = 1
    return
  }

  async function exec(cmd: ReadonlyArray<string | number>): Promise<unknown> {
    const res = await fetch(url!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token!}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    })
    if (!res.ok) throw new Error(`Upstash REST ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { result?: unknown; error?: string }
    if (json.error) throw new Error(`Upstash error: ${json.error}`)
    return json.result
  }

  const pattern = keyPattern(args.bucket)
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, batch] = (await exec(['SCAN', cursor, 'MATCH', pattern, 'COUNT', 500])) as [string, string[]]
    keys.push(...batch)
    cursor = next
  } while (cursor !== '0')

  if (keys.length === 0) {
    console.log(`Already clean — no \`${pattern}\` keys in Upstash.`)
    return
  }

  console.log(`This resets the rate limit of every visitor, not just yours (${new URL(url).host}):`)
  for (const { bucket, keys: count, visitors } of summariseKeys(keys)) {
    console.log(`  ${bucket}: ${count} key(s), ${visitors} visitor(s)`)
  }

  if (!args.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await rl.question('Delete them? [y/N] ')).trim().toLowerCase()
    rl.close()
    if (answer !== 'y' && answer !== 'yes') {
      console.log('Nothing deleted.')
      return
    }
  }

  let deleted = 0
  for (let i = 0; i < keys.length; i += 500) deleted += (await exec(['DEL', ...keys.slice(i, i + 500)])) as number
  console.log(`Deleted ${deleted} key(s). The next scan starts at 5 remaining.`)
}

if (process.argv[1] && process.argv[1].endsWith('clear-rate-limit.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
