import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'

/**
 * Supabase client scoped to the current Clerk-authenticated user. The
 * Clerk session JWT is forwarded as the `Authorization` header; PostgREST
 * populates `request.jwt.claim.sub` from it, and `auth.uid()` in RLS
 * predicates resolves to the Clerk user id. RLS is the load-bearing
 * security boundary for `user_id`-scoped tables (taste profiles,
 * corrections, rating events) per [ADR-0010].
 *
 * The Clerk dashboard must have a JWT template named `supabase` configured.
 * Token claims include `sub` and `role: "authenticated"` so Supabase's
 * RLS helpers resolve as expected.
 *
 * Phase 2 ships this factory with no consumers; Phase 2.5+ slices wire it
 * into server components and AI SDK tools that read user data.
 *
 * [ADR-0010]: ../../../docs/adr/0010-pg-direct-vs-supabase-js-for-user-data.md
 */
export async function getUserScopedClient(): Promise<SupabaseClient> {
  const { getToken } = await auth()
  const token = await getToken({ template: 'supabase' })
  if (!token) {
    throw new Error(
      'No Clerk session token. The caller must be inside an authenticated request — getUserScopedClient() is not callable from public routes.',
    )
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Both must be set before getUserScopedClient() is called.',
    )
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
