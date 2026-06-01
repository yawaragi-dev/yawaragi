import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'

// supabase-js client that pulls Clerk session tokens on demand so PostgREST RLS
// resolves auth.uid() correctly. See docs/adr/0010-pg-direct-vs-supabase-js-for-user-data.md.
export function getUserScopedClient(): SupabaseClient {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Both must be set before getUserScopedClient() is called.',
    )
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    accessToken: async () => (await auth()).getToken(),
  })
}
