import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'

/**
 * Thrown when {@link getUserScopedClient} is used without an authenticated
 * Clerk session.
 *
 * Why loud, not silent (#219): without a session the Clerk `getToken()`
 * resolves to `null`, supabase-js falls back to the anon key, and PostgREST
 * evaluates RLS as the `anon` role — a user-scoped table (`auth.uid() =
 * user_id`) then returns **zero rows**. In dev that reads as an innocent "no
 * data yet"; in reality it's an auth bug that would ship. Failing loudly the
 * instant supabase-js tries to attach auth to the first request turns that
 * silent-empty into an obvious stack trace at the exact call that misled us.
 *
 * If a caller genuinely wants the unauthenticated path (a public read via
 * supabase-js/PostgREST rather than pg-direct), it must opt in explicitly via
 * {@link getAnonScopedClient} — silence is never the default.
 */
export class UnauthenticatedUserScopeError extends Error {
  constructor() {
    super(
      'getUserScopedClient() was called without an authenticated Clerk session. ' +
        'User-scoped tables are guarded by Postgres RLS (auth.uid() = user_id); with no ' +
        'session the request falls back to the anon key and silently returns zero rows — ' +
        'an auth bug that looks like "no data" in dev. Ensure the caller runs behind Clerk ' +
        'auth, or, for a genuinely public read, use getAnonScopedClient() explicitly.',
    )
    this.name = 'UnauthenticatedUserScopeError'
  }
}

function supabaseCredentials(): { url: string; anonKey: string } {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Both must be set before a Supabase client is created.',
    )
  }
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
}

// supabase-js client that pulls Clerk session tokens on demand so PostgREST RLS
// resolves auth.uid() correctly. See docs/adr/0010-pg-direct-vs-supabase-js-for-user-data.md.
//
// A type-level "is authenticated" proof isn't cleanly expressible here — auth
// state is a runtime property of the request, not something the caller can hold
// a compile-time witness for. So the contract is enforced at runtime: an
// unauthenticated call throws {@link UnauthenticatedUserScopeError} rather than
// degrading to an empty result. The disjoint, deliberately-named
// {@link getAnonScopedClient} is the only sanctioned anonymous path.
export function getUserScopedClient(): SupabaseClient {
  const { url, anonKey } = supabaseCredentials()
  return createClient(url, anonKey, {
    accessToken: async () => {
      const token = await (await auth()).getToken()
      if (!token) {
        throw new UnauthenticatedUserScopeError()
      }
      return token
    },
  })
}

/**
 * Explicit, deliberately-named escape hatch: a supabase-js client on the anon
 * key with **no** Clerk token attached. It reaches only rows visible to the
 * `anon` role under RLS (public Sakenowa data). Use it when a caller genuinely
 * wants the unauthenticated PostgREST path — never as an accidental fallback
 * from {@link getUserScopedClient}. Nothing consumes it yet; it exists so the
 * anonymous path is a named decision rather than a silent default.
 */
export function getAnonScopedClient(): SupabaseClient {
  const { url, anonKey } = supabaseCredentials()
  return createClient(url, anonKey)
}
