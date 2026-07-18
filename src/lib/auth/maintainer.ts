import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'
import { isMaintainer, parseMaintainerAllowlist } from '@/lib/auth/maintainer-allowlist'

/**
 * The server-side maintainer gate (ADR-0020, #244) — the seam P5.5-C's journal
 * actions/routes call to decide whether the current request may reach the
 * *persistent* tasting journal, or only the interactive-but-ephemeral example.
 *
 * This is the one module that touches env + Clerk `auth()`; the membership logic
 * itself lives in the pure, directly-testable `maintainer-allowlist.ts`. Same
 * pure-core / server-shell split as the JournalStore port (P5.5-A).
 *
 * The allowlist is parsed once at module load: `env` is static for the process
 * lifetime, so re-splitting the string per request would be wasted work.
 */
const allowlist = parseMaintainerAllowlist(env.MAINTAINER_USER_IDS)

/**
 * Whether the currently-authenticated Clerk user is a maintainer. Resolves
 * `false` for an anonymous/signed-out request (no `userId`) and whenever the
 * allowlist is empty — fail-closed, so the persistent journal never opens up by
 * accident (e.g. an unset env var on a fresh deploy).
 */
export async function currentUserIsMaintainer(): Promise<boolean> {
  const { userId } = await auth()
  return isMaintainer(userId, allowlist)
}
