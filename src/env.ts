import { z } from 'zod'

/**
 * Every field is `.optional()` by default. When a vendor is wired up, the
 * PR that introduces the integration tightens the relevant field(s) back to
 * a required shape so the missing-secret failure happens at import time,
 * not at the first runtime call.
 *
 * `empty()` adapts `.env*` files where unset keys land as empty strings
 * (`LANGFUSE_HOST=`) — Zod's plain `.optional()` would still validate `""`
 * against `.url()` / `.min(N)` and reject it. We treat empty as undefined.
 */
const empty = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema)

const Env = z.object({
  ANTHROPIC_API_KEY: empty(z.string().optional()),
  // Postgres connection string for the Supabase project (Project → Settings →
  // Database → Connection string). Used by the pg.Pool in server-client.ts.
  // Stays optional in the schema so the app boots without it; the pool
  // constructor throws at first use with a clear message.
  DATABASE_URL: empty(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_URL: empty(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: empty(z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: empty(z.string().optional()),
  CLERK_SECRET_KEY: empty(z.string().optional()),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: empty(z.string().optional()),
  LANGFUSE_PUBLIC_KEY: empty(z.string().optional()),
  LANGFUSE_SECRET_KEY: empty(z.string().optional()),
  LANGFUSE_HOST: empty(z.string().url().optional()),
  CRON_SECRET: empty(z.string().min(16).optional()),
})
export const env = Env.parse(process.env)
