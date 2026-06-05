import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UserTable } from './db-tables'
import { getUserScopedClient } from './user-client'

/**
 * Type-branded read/write entry-point for `UserTable` tables (supabase-js +
 * Clerk JWT path).
 *
 * Counterpart to `publicQuery`. Calling `userQuery('brands', ...)` fails at
 * the type checker because `brands` is a `PublicTable` — a public read has
 * no business going through the supabase-js + JWT round-trip and would, at
 * runtime, hit anon-role RLS rather than `auth.uid()`-scoped RLS, masking
 * the real bug.
 *
 * Returns the underlying supabase-js query builder for the named table so
 * existing supabase-js fluent chains (`.select`, `.insert`, `.update`,
 * `.eq`, `.single`, …) keep working unchanged at the call site.
 *
 * In production, omit `client`; the default is {@link getUserScopedClient}.
 * Tests can inject a hand-signed-JWT client for fixture users.
 *
 * NB: today `UserTable` is `never` (Phase 2 has no user-scoped tables yet);
 * this function therefore can't be successfully called yet. The barrier is
 * preregistered so the moment Phase 2.5+ lands `taste_profiles` etc. as a
 * `UserTable`, every user-scoped read picks the right adapter automatically.
 */
export function userQuery<T extends UserTable>(
  // Literal `UserTable` member. See `publicQuery` for the same brand/seam
  // rationale.
  table: T,
  client?: SupabaseClient,
): ReturnType<SupabaseClient['from']> {
  if (typeof table !== 'string' || (table as string).length === 0) {
    throw new Error('userQuery: table classification token must be a non-empty string')
  }
  const sb = client ?? getUserScopedClient()
  return sb.from(table)
}
