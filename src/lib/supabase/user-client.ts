import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'

// supabase-js client carrying the Clerk session JWT so PostgREST RLS resolves
// auth.uid() correctly. See docs/adr/0010-pg-direct-vs-supabase-js-for-user-data.md.
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
