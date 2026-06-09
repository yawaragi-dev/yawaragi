/**
 * Maintainer utility — wipe the anonymous rate-limit budget so the
 * next scan starts fresh. Useful when testing the scan flow on a
 * preview deploy hits the 5-call/24h cap.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/clear-rate-limit.ts
 *
 * Reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from
 * the environment, finds every `rl:*` key in the configured Upstash
 * Redis, and deletes them in one DEL call. Other keys (if any) are
 * left untouched.
 *
 * NOT committed-state mutation: there is no DB row to reset. The
 * rate-limit module's cookie + hashed-IP identifiers are stateless
 * outside Upstash; clearing the KV is the complete reset.
 *
 * If the Upstash instance is dedicated to this project (recommended),
 * `FLUSHDB` from the Upstash dashboard is the equivalent zero-code
 * one-click alternative.
 */

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

if (!url || !token) {
  console.error(
    'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. ' +
      'Add both to .env.local (copy from Upstash dashboard → REST API tab) and rerun.',
  )
  process.exit(1)
}

async function exec(cmd: ReadonlyArray<string>): Promise<unknown> {
  const res = await fetch(url!, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) {
    throw new Error(`Upstash REST ${res.status}: ${await res.text()}`)
  }
  const json = (await res.json()) as { result?: unknown; error?: string }
  if (json.error) throw new Error(`Upstash error: ${json.error}`)
  return json.result
}

const keys = (await exec(['KEYS', 'rl:*'])) as string[]

if (keys.length === 0) {
  console.log('Already clean — no `rl:*` keys in Upstash.')
  process.exit(0)
}

console.log(`Found ${keys.length} rate-limit key(s):`)
for (const k of keys) console.log(`  ${k}`)

const deleted = (await exec(['DEL', ...keys])) as number
console.log(`Deleted ${deleted} key(s). Your next scan starts at 5 remaining.`)

// Make this file a module so TS allows top-level `await`. The script
// has no exports for consumers — this is purely a TS-mode requirement.
export {}
