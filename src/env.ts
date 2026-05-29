import { z } from 'zod'

/**
 * Every field is `.optional()` by default. When a vendor is wired up, the
 * PR that introduces the integration tightens the relevant field(s) back to
 * `.min(1)` so the missing-secret failure happens at import time, not at
 * the first runtime call.
 */
const Env = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  // Postgres connection string for the Supabase project (Project → Settings →
  // Database → Connection string). Used by the pg.Pool in server-client.ts.
  // Stays optional in the schema so the app boots without it; the pool
  // constructor throws at first use with a clear message.
  DATABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_HOST: z.string().url().optional(),
  CRON_SECRET: z.string().min(16).optional(),
})
export const env = Env.parse(process.env)
