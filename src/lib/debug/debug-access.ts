import 'server-only'
import { env } from '@/env'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'

/**
 * Whether this request gets the debug panel and the per-step server trace.
 *
 * The `yawaragi_debug` cookie is the visitor's opt-in, and anyone can set it
 * with `?debug=1`. The trace shows server-side detail (raw label reads, query
 * parameters, model usage), so on Production the cookie counts only for a
 * signed-in maintainer (`MAINTAINER_USER_IDS`, ADR-0020's allowlist). Local
 * dev and Preview keep the plain cookie, which the manual-testing recipes and
 * `pnpm eval suggest-jp` rely on.
 *
 * Kept apart from `debug-mode.ts` because that module is imported by the
 * proxy, where Clerk's `auth()` is not the right tool.
 */
export async function isDebugEnabled(
  cookies: Parameters<typeof isDebugEnabledFromCookies>[0],
): Promise<boolean> {
  if (!isDebugEnabledFromCookies(cookies)) return false
  if (env.VERCEL_ENV !== 'production') return true
  return currentUserIsMaintainer()
}
