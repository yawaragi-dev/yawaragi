/**
 * Maintainer utility — ADR-0009's retention rule "account data until deletion
 * or 24 months of inactivity", as a report. Lists the Clerk accounts with no
 * activity for that long and what each holds in Upstash and the backups.
 *
 * Usage:
 *   pnpm accounts:inactive                 # 24 months
 *   pnpm accounts:inactive -- --months 12
 *
 * It reads only and erases nothing. Acting on the report is one
 * `pnpm journal:erase -- --user <id> --yes` plus deleting the user in Clerk,
 * per account; whether to automate that (and to warn by email first) is a
 * decision still open in #454 §4.
 */
import { BACKUP_BUCKET, backupPrefix } from '@/lib/collection/backup-storage'
import { SupabaseBackupStorage } from '@/lib/collection/supabase-backup-storage'
import { UpstashBottleHistoryStore, UpstashCellarStore, UpstashExpressionStore, UpstashJournalStore } from '@/lib/collection/upstash-record-store'

export interface AccountActivity {
  id: string
  createdAt: number
  lastSignInAt: number | null
  lastActiveAt: number | null
}

/** The fields of Clerk's Backend API user object this report reads. */
interface ClerkUser {
  id: string
  created_at: number
  last_sign_in_at: number | null
  last_active_at: number | null
}

function fromClerk(user: ClerkUser): AccountActivity {
  return {
    id: user.id,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at,
    lastActiveAt: user.last_active_at,
  }
}

/** The latest sign of life Clerk has for an account; sign-up when there is nothing else. */
export function lastActivity(user: AccountActivity): number {
  return Math.max(user.createdAt, user.lastSignInAt ?? 0, user.lastActiveAt ?? 0)
}

/** Accounts whose last activity is more than `months` before `now`, oldest first. */
export function inactiveSince<T extends AccountActivity>(
  users: readonly T[],
  { now, months }: { now: number; months: number },
): T[] {
  const line = new Date(now)
  line.setUTCMonth(line.getUTCMonth() - months)
  return users
    .filter((user) => lastActivity(user) < line.getTime())
    .sort((a, b) => lastActivity(a) - lastActivity(b))
}

function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}

async function main(): Promise<number> {
  const months = Number(flag(process.argv.slice(2), 'months') ?? 24)
  if (!Number.isInteger(months) || months < 1) {
    console.error('--months takes a whole number of months.')
    return 1
  }
  const secretKey = process.env.CLERK_SECRET_KEY
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey || !url || !token || !sbUrl || !sbKey) {
    console.error(
      'Needs CLERK_SECRET_KEY, UPSTASH_REDIS_REST_URL/TOKEN, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
    return 1
  }

  // Clerk's Backend API directly: the SDK's Next.js entry drags Next in, and
  // `@clerk/backend` is not a direct dependency.
  const users: AccountActivity[] = []
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(`https://api.clerk.com/v1/users?limit=100&offset=${offset}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })
    if (!response.ok) throw new Error(`Clerk users list: HTTP ${response.status}`)
    const page = (await response.json()) as ClerkUser[]
    users.push(...page.map(fromClerk))
    if (page.length < 100) break
  }

  const inactive = inactiveSince(users, { now: Date.now(), months })
  console.log(`${users.length} account(s); ${inactive.length} without activity for ${months} months.`)
  if (inactive.length === 0) return 0

  const journal = new UpstashJournalStore(url, token)
  const cellar = new UpstashCellarStore(url, token)
  const expressions = new UpstashExpressionStore(url, token)
  const bottleHistory = new UpstashBottleHistoryStore(url, token)
  const storage = new SupabaseBackupStorage(sbUrl, sbKey, BACKUP_BUCKET)
  for (const user of inactive) {
    const [j, c, x, h, backups] = await Promise.all([
      journal.dump(user.id),
      cellar.dump(user.id),
      expressions.dump(user.id),
      bottleHistory.size(user.id),
      storage.list(backupPrefix(user.id)),
    ])
    const since = new Date(lastActivity(user)).toISOString().slice(0, 10)
    console.log(
      `  ${user.id}  last seen ${since}  journal ${j.records.length}, cellar ${c.records.length}, bottlings ${x.records.length}, bottle events ${h}, backups ${backups.length}`,
    )
  }
  console.log('Nothing erased. Per account: pnpm journal:erase -- --user <id> --yes, then delete the user in Clerk.')
  return 0
}

if (process.argv[1] && process.argv[1].endsWith('inactive-accounts.ts')) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
