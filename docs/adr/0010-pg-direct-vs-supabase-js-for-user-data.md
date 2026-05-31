# ADR-0010: pg-direct for admin/public data, supabase-js + Clerk JWT for user-scoped reads

## Status

Decided — 2026-05-31

## Context

Phase 2 ships a Sakenowa reference mirror (brands, breweries, flavor_charts, areas, flavor_tags, rankings, ingestion_runs) read via pg-direct using the `postgres` role (`BYPASSRLS`). That is correct today: the data is public Sakenowa content with no per-user dimension, and the `BYPASSRLS` role lets server components and the ingest CLI talk to Postgres without any JWT plumbing.

Phase 2.5+ introduces user-scoped tables — taste profiles, brand corrections, rating events. Every row carries a `user_id` foreign-keyed to a Clerk user. Reads must enforce `WHERE user_id = auth.uid()` via Row-Level Security so that:

- A bug in a server component cannot return another user's taste profile.
- A future Phase 4 chat tool that runs server-side cannot accidentally leak across users.
- The security boundary lives in Postgres, not in TypeScript code that any new contributor can subtly bypass.

The current pg-direct setup cannot enforce RLS for user-scoped reads. The `postgres` role bypasses RLS unconditionally. Switching the role does not help on its own: `auth.uid()` reads `request.jwt.claim.sub` from a Postgres GUC that has to be populated per request from a verified Clerk JWT.

Three options were enumerated in [issue #69](https://github.com/yawaragi-dev/yawaragi/issues/69):

**Option A — Add `@supabase/supabase-js` as a parallel data path.**
For user-scoped reads, initialize a per-request supabase-js client with a Clerk-issued JWT in the `Authorization` header. supabase-js forwards the JWT to PostgREST, PostgREST populates `request.jwt.claim.sub`, RLS evaluates `auth.uid()` correctly. pg-direct stays for admin work (ingest, migrations) and public reads (Sakenowa reference data).

Worked example:
```ts
// src/lib/supabase/user-client.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'

export async function getUserScopedClient() {
  const { getToken } = await auth()
  const token = await getToken({ template: 'supabase' })
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// src/lib/profiles/lookup.ts
export async function lookupTasteProfile(): Promise<TasteProfile | null> {
  const supabase = await getUserScopedClient()
  const { data, error } = await supabase
    .from('taste_profiles')
    .select('user_id, f1, f2, f3, f4, f5, f6')
    .single()
  if (error) throw new Error(error.message)
  return data
}
```

**Option B — Extend pg-direct with per-request `SET LOCAL "request.jwt.claim.sub"`.**
Validate the Clerk JWT in TypeScript, extract `sub`, switch from the `postgres` role to a non-`BYPASSRLS` role (`authenticated`), `SET LOCAL` the sub claim, run the query.

Worked example:
```ts
// src/lib/profiles/lookup.ts
export async function lookupTasteProfile(): Promise<TasteProfile | null> {
  const { sessionClaims } = await auth()
  const sub = sessionClaims?.sub
  if (!sub) throw new Error('not authenticated')

  const client = await getServerDbPool().connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE authenticated')
    await client.query('SET LOCAL "request.jwt.claim.sub" = $1', [sub])
    const { rows } = await client.query<TasteProfileRow>(
      'SELECT user_id, f1, f2, f3, f4, f5, f6 FROM taste_profiles',
    )
    await client.query('COMMIT')
    return rows[0] ? rowToTasteProfile(rows[0]) : null
  } finally {
    client.release()
  }
}
```

**Option C — Per-query SECURITY DEFINER functions / a JWT-issuing edge function.**
Write a `current_user_taste_profile(clerk_user_id)` Postgres function with `SECURITY DEFINER`; call it from pg-direct, passing the Clerk sub. RLS is bypassed inside the function, which restricts visibility via its own `WHERE` clause. Requires one function per query type.

## Decision

**Option A.** Add `@supabase/supabase-js` as a parallel data path scoped to Clerk-authenticated user data. pg-direct remains the data path for:
- Admin / migration tooling (`pnpm migrate`, `pnpm ingest`, `pnpm db:reset`).
- Public Sakenowa reference reads (Phase 2 brand page, flavor chart, brewery, area, ranking, flavor_tag).
- The cron ingestion route (`POST /api/cron/ingest`) — also admin-shaped.

supabase-js becomes the data path for:
- Every read or write of a `user_id`-scoped table from server components or AI SDK tools (Phase 2.5+ taste profiles, corrections, rating events).
- Any future surface where RLS is the load-bearing security mechanism.

Responsibility split, encoded as a hard convention:

| Layer | Reads | Writes |
|---|---|---|
| `src/lib/sakenowa/lookup.ts` (pg-direct, BYPASSRLS) | brands, breweries, flavor_charts, areas, flavor_tags, rankings | none from app code (only `pnpm ingest`) |
| `src/lib/supabase/user-client.ts` (supabase-js, Clerk JWT) | taste_profiles, brand_corrections, rating_events | same |
| `src/lib/sakenowa/db.ts` + scripts/ (pg-direct, BYPASSRLS) | hash-skip read in ingest | every Sakenowa-mirror write |

A user-scoped read MUST go through supabase-js. A pg-direct read of any user-scoped table from server-component code is a bug.

## Consequences

**Code that has to be written before #55 (Clerk integration) merges:**

- `src/lib/supabase/user-client.ts` — `getUserScopedClient()` that pulls the Clerk session JWT and instantiates a supabase-js client. Sits next to the existing `src/lib/supabase/server-client.ts` (which stays as the BYPASSRLS pool factory).
- A Clerk → Supabase JWT template configured in the Clerk dashboard. Token claims must include `sub` and (for compatibility with Supabase's RLS helpers) a `role` claim of `authenticated`.
- The JWT template's signing key (or Supabase's public verification key — depends on the chosen Clerk Third-Party Auth setup) lives in `src/env.ts` as a required env var.

**Test infrastructure changes:**

- The testcontainer harness (`tests/integration/setup.ts`) already sets up the `anon` and `authenticated` roles via bootstrap.sql; that work is reusable.
- Phase 2.5+ user-data integration tests need a way to forge a Clerk-shaped JWT for a fixture user. Pattern: hand-sign a minimal JWT with the same secret/key the testcontainer's `authenticated` role accepts, set as the supabase-js `Authorization` header. Document the helper next to the bootstrap.

**Phase 4 chat tool implications:**

- AI SDK tools that read user data run server-side inside a Next.js route. They use the same `getUserScopedClient()` as server components. RLS is the only thing standing between a buggy tool prompt and a cross-user leak — the responsibility split makes this enforceable.

**Vendor lock-in:**

- supabase-js is Supabase-specific. Moving to another Postgres host means rewriting the `getUserScopedClient` layer (the call-sites stay the same shape because the underlying RLS contract is Postgres-native). pg-direct's BYPASSRLS path is portable to any managed Postgres.
- Acceptable lock-in. Supabase exit is not a planned event; the security-correctness win is concrete.

**Performance:**

- supabase-js routes through PostgREST, which adds one HTTP hop vs pure pg. For user-scoped reads (low volume per request), the latency is invisible. For high-volume admin reads (ingest scan: 5k brands), staying on pg-direct preserves the existing batched-upsert throughput.

**Type safety:**

- supabase-js generates types from the live schema via `supabase gen types typescript`. Wire this into the migration workflow as a follow-up so Phase 2.5+ tables get generated types automatically.
- Hand-rolled types stay for pg-direct calls (matching the current slice 4/5/9 pattern).

**Merge gate (encoded in CLAUDE.md + PR template):**

> Phase 2.5+ slices that touch user-scoped data MUST read via `getUserScopedClient()` (supabase-js + Clerk JWT). Direct pg-pool reads of user-scoped tables from app code are an antipattern. The PR template's GDPR section gains a checkbox: "User-scoped reads/writes route through supabase-js, not pg-direct."

## References

- [Issue #69](https://github.com/yawaragi-dev/yawaragi/issues/69) — surfacing PR.
- [Issue #55](https://github.com/yawaragi-dev/yawaragi/issues/55) — Clerk integration; consumes this decision.
- [ADR-0009](./0009-gdpr-compliance-posture.md) — GDPR posture; Supabase RoPA row gains a "supabase-js + Clerk JWT path for user data" annotation.
- [Supabase: Clerk + Supabase auth](https://supabase.com/partners/integrations/clerk) — vendor docs for the Third-Party Auth pattern.
- [PostgREST: JWT and RLS](https://postgrest.org/en/stable/auth.html) — how `request.jwt.claim.*` GUCs reach RLS predicates.
