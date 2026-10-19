import { Pool, type PoolConfig } from 'pg'

/**
 * The app's pg pool, sized for a serverless function sharing one Supabase
 * pooler with every other copy of itself.
 *
 * pg's defaults (`max: 10`, connections kept 10 s after their last query) are
 * a long-running server's. On Vercel each warm instance holds its own pool,
 * and a burst of requests — deleting tastings one after another, each delete
 * followed by the page's refresh — lands on several instances at once. The
 * bottle page runs five catalogue lookups in parallel, so with the defaults
 * every instance opened five connections and kept them. Supabase's pooler in
 * session mode gives each open connection a slot of its own and has fifteen,
 * shared with Preview deployments and any local dev server on the same
 * database; the instance that asked for the sixteenth got `EMAXCONNSESSION`,
 * the render threw, and the page was replaced by the error screen. Production
 * logged exactly that on the sake page and its refresh on 2026-10-11 and
 * 2026-10-15.
 *
 * - `max` {@link SERVER_POOL_MAX}: a render's lookups queue behind three
 *   connections instead of opening one each. They are millisecond primary-key
 *   reads; queueing costs little, a refused slot costs the page.
 * - `idleTimeoutMillis`: give a slot back two seconds after it went quiet, not
 *   ten, so a burst does not leave every instance squatting on its share.
 * - `connectionTimeoutMillis`: a pooler that does not answer fails the render
 *   in five seconds rather than holding it until the function times out.
 *
 * The structural fix is the pooler's transaction mode (port 6543), which
 * multiplexes clients over its connections instead of reserving one each —
 * that is a `DATABASE_URL` change, documented in `.env.example`. These limits
 * keep session mode safe until then, and cost nothing after.
 */
export const SERVER_POOL_MAX = 3

export const SERVER_POOL_OPTIONS = {
  max: SERVER_POOL_MAX,
  idleTimeoutMillis: 2_000,
  connectionTimeoutMillis: 5_000,
} as const satisfies PoolConfig

export function createServerPool(connectionString: string, overrides: PoolConfig = {}): Pool {
  return new Pool({ connectionString, ...SERVER_POOL_OPTIONS, ...overrides })
}
