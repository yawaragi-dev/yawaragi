-- Testcontainer bootstrap: mirror Supabase's default role + schema posture
-- closely enough that RLS-bearing tests behave the same in CI as they do in
-- production. Applied once per test run by tests/integration/setup.ts before
-- migrations execute.
--
-- Scope
-- -----
-- We replicate what a fresh Supabase project ships with that is load-bearing
-- for our app-level queries:
--   * The three roles the app authenticates as (anon, authenticated, service_role).
--   * USAGE on the public schema so anon/authenticated can even reach a table
--     before per-table GRANT SELECT comes into play.
--   * ALL on the public schema for service_role (Supabase parity; matches
--     `GRANT ALL ON SCHEMA public TO postgres, service_role`).
--   * Default privileges so future migrations that forget per-table grants
--     don't silently lock anon/authenticated out — the test container will
--     surface the same defaults production does.
--
-- Deliberate omissions (not exercised from app code, so unneeded for tests)
-- -----------------------------------------------------------------------
--   * supabase_admin / pgbouncer / authenticator infrastructure roles —
--     superset of what we test; not referenced by migrations or app code.
--   * auth.* schema (Supabase's gotrue tables) — we use Clerk for user auth,
--     so gotrue's tables are irrelevant. We DO, however, ship a minimal
--     `auth.uid()` function (see below): RLS policies on user-scoped tables
--     reference it, so the testcontainer must resolve the same symbol
--     production does. Everything else under auth.* stays omitted.
--   * realtime.* schema — we don't subscribe to realtime channels.
--   * storage.* schema — no file storage usage path.
--   * extensions schema and pre-installed extensions (pgcrypto, uuid-ossp,
--     pg_graphql, etc.) — install them in a migration if/when a feature
--     actually needs them.
--
-- If a future Supabase production behavior diverges from these defaults and
-- causes a test/prod skew, the fix belongs in this file (versioned, reviewed)
-- rather than inlined into setup.ts.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

-- The migration runner connects as the container's superuser. Grant it
-- membership in the three Supabase roles so `SET ROLE anon` from tests works
-- without a password and migrations can `GRANT ... TO anon` against an
-- existing role.
GRANT anon, authenticated, service_role TO CURRENT_USER;

-- Schema-level access. Without USAGE, even a `GRANT SELECT ON brands TO anon`
-- would not let anon resolve the `public.brands` name.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON SCHEMA public TO service_role;

-- Default privileges: any table created in the public schema after this point
-- (by the migration runner / CURRENT_USER) inherits SELECT for anon and
-- authenticated, and ALL for service_role. Mirrors Supabase's stock posture so
-- migrations that forget per-table GRANTs still behave like production rather
-- than diverging silently.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- auth.uid() shim (#219)
-- ----------------------
-- User-scoped RLS policies read the current caller's identity via `auth.uid()`
-- (e.g. `USING (auth.uid() = user_id)`). In production that function is part of
-- Supabase's `auth` schema and resolves the `sub` claim of the verified JWT
-- PostgREST puts in a per-request GUC. We use Clerk (not gotrue), but the
-- PostgREST → GUC → auth.uid() mechanism is identical: Clerk is wired as a
-- Supabase Third-Party Auth provider (ADR-0010), Supabase verifies the Clerk
-- JWT against Clerk's JWKS, and PostgREST populates `request.jwt.claims` with
-- the claim set. This shim reproduces that read so RLS behaves the same in the
-- testcontainer as it does in production.
--
-- GUC choice: we read `request.jwt.claims` (the whole claim set as JSON) and
-- extract `sub`, with a fallback to the legacy scalar `request.jwt.claim.sub`
-- form. This mirrors Supabase's own `auth.uid()` coalesce and is exactly what
-- `withUserContext()` (tests/integration/with-user-context.ts) sets. The second
-- arg `true` to current_setting is `missing_ok` — an unset GUC yields NULL
-- (unauthenticated) rather than erroring, so an anon caller simply matches no
-- rows.
--
-- Return type is TEXT, not UUID (Supabase's stock signature). Clerk subject
-- ids look like `user_2abc…`, which are NOT UUIDs; user-scoped tables therefore
-- carry `user_id TEXT`. Casting to uuid here would throw on every real Clerk
-- sub. Keeping it TEXT is the deliberate, documented divergence from stock
-- Supabase for a Clerk-backed project.
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
