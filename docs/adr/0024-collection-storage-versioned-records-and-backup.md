---
title: ADR-0024 — Collection storage: Cellar and detailed notes on Upstash, versioned records, a daily backup, and the Postgres path
status: accepted
date: 2026-10-05
amends: ADR-0020
---

# ADR-0024: Collection storage — Cellar and detailed notes on Upstash, versioned records, a daily backup, and the Postgres path

## Context

[ADR-0020](./0020-tasting-journal-spine-and-maintainer-only-persistence.md) put the maintainer's TastingJournal in Upstash Redis, one hash per user, behind a `JournalStore` port, and named Postgres + Supabase Pro as the public-launch migration. That journal is a star rating and a free-text note per entry, and its only backstop is a hand-run `pnpm journal:export`.

The next slice is the core loop around a concrete bottle (design v1.4): find it, **rate it with one tap and a quick note** (§5), **keep it in the Cellar** (§11), and **write detailed notes** (§10). It adds two kinds of data and changes the shape of the third:

- **Cellar rows** — a new record type: which sakes the user owns, how many, and when one was opened.
- **Detailed notes** — §10's structured tasting sheet (appearance, nose, five palate scales, how it was served, a verdict).
- **Quick tags** — §5's chips on an entry (the bottle's strongest flavor axes, "Chilled", "With food"; see #367).

Three things make this the moment to settle storage rather than bolt the fields on:

1. **The shapes will keep changing.** §10's vocabulary is the designers' first pass; Cellar has an open decision (freshness thresholds, *nama*); the Wishlist comes next. Every change today would silently invalidate stored JSON, because `parseStoredEntries` drops anything that no longer parses — on a store we call permanent.
2. **Redis is still the system of record**, and ADR-0011 still blocks the first `user_id` table. Adding a second record type to Upstash widens what a lost database costs. The maintainer asked for the backup to ship *with* the Cellar, not after it.
3. **The Postgres move has to stay cheap.** ADR-0020 promised "a third adapter behind the same port". That stays true only if the record format is decided with Postgres in mind now.

## Decision

### 1. Same substrate, same gate

Cellar rows and detailed notes live in **Upstash**, under the maintainer-only gate of ADR-0020. Nothing about who can persist changes: the public still gets no stored data, and no `user_id` table is added, so ADR-0011 does not fire.

- **Detailed notes and quick tags are fields of a JournalEntry**, not a separate store. A note describes one tasting; giving it its own key would give one tasting two records to export, erase and keep consistent.
- **The Cellar is its own store**, `CellarStore`, with the same port + in-memory + Upstash adapter pattern as `JournalStore`. One Redis hash per user, `cellar:user:<clerkUserId>`, **field = Sakenowa brand id** — one row per Sake, with a count, because §11 draws "× 2" on one row and "Another bottle added · 2 in cellar" on the second add.

### 2. Every stored record carries a `schemaVersion`; old versions are upcast on read

Each record type (JournalEntry, CellarBottle) has an integer `schemaVersion` and a chain of pure **upcasters**, `v(n) → v(n+1)`.

- **Writes** always produce the current version.
- **Reads** parse the JSON, read `schemaVersion`, run the upcasters up to the current version, then validate against the current Zod schema. Call sites only ever see the current shape.
- **A record with no `schemaVersion` is version 1.** That covers every JournalEntry written before this ADR, so none of them needs a migration job: the v1 → v2 upcaster runs on read, and the record is rewritten in v2 the next time it is edited.
- **No bulk migration jobs.** Records move forward lazily. An upcaster stays in the code for as long as a record of its source version can exist, which in practice is until a restore-from-backup has rewritten every record (§4).
- **Unreadable records are kept, never silently lost.** A record that fails to parse or to upcast — tampering, a bug, or a version *newer* than the running code after a rollback — is left untouched in the store and skipped by the UI. Exports and backups still carry it, raw, under `rejected`. ADR-0020's "one bad entry must not nuke the whole journal" stays; "one bad entry silently vanishes from the backup" does not.

JournalEntry v2 adds `schemaVersion: 2` and three optional fields: `tags` (§5's chips, stored as stable keys, translated on render), `detail` (§10's sheet, every part optional, every value a stable key or a 1–5 step) and `updatedAt`. A v2 rating may also carry `target: null`: half the catalogue has no flavor chart (ADR-0016), and a tasting of such a sake is still a tasting. It is recorded, it counts, and the Palate fold skips it. CellarBottle starts at v1: `brandId`, the denormalised sake name, `count`, `openedAt` (null when unopened), `addedAt`, `updatedAt`.

*Nama* is deliberately **not** in CellarBottle v1, although CONTEXT.md describes it as a boolean on the row: nothing in the catalogue says whether a sake is *nama*, and no screen lets the user set it yet. It is the expected CellarBottle v2, and the first real exercise of the upcaster chain.

### 3. The export envelope moves to `formatVersion: 2`

```
{ formatVersion: 2, exportedAt, userId, journal: JournalEntry[], cellar: CellarBottle[], rejected: { store, id, raw }[] }
```

- `journal` and `cellar` hold records **verbatim in their current version**, so an export is both the GDPR Art. 20 file and a restorable copy (ADR-0020).
- `formatVersion` versions the *envelope* only. A record's shape is its own `schemaVersion`'s business, so a new journal field does not bump the envelope.
- The reader accepts **v1 files** (`entries` → `journal`, an empty cellar) and refuses any version it does not know, rather than mis-reading it.

### 4. A daily backup ships with the Cellar, and a restore path with it

- **Vercel Cron**, daily, calls `/api/cron/backup-collection`, guarded by `CRON_SECRET` exactly like the ingest route.
- For each maintainer in `MAINTAINER_USER_IDS`, it builds the v2 export and uploads it to a **private Supabase Storage bucket**, `collection-backups/<clerkUserId>/<ISO instant>.json`, then deletes all but the **newest 30** for that user.
- **Supabase**, because it is already a signed processor in `eu-central-1` (ADR-0009) and the app already holds its service credentials. It is a different vendor from Upstash, which is the point: the backup must not share a failure with the store it backs up. Vercel Blob was the alternative; it would be a new store to provision and a new RoPA row for no gain.
- **Restore** is `pnpm journal:restore -- --file <export.json>`: it reads any export the reader accepts, upcasts, and upserts every record by id. Upserting makes it idempotent, so a half-finished restore can simply be rerun. It is the same code path the Postgres backfill will use (§5).
- The daily write also keeps the Upstash database active, so a free-tier database is not archived for inactivity.

ADR-0011's concern applies in a narrow form: Preview deployments share the Supabase project and so could, in principle, read the bucket. No deployed code reads it — only the cron writes and only the local restore script reads — and the only data subject is the maintainer. That is accepted for the private beta and is closed by the same Pro + Branches step that closes it for tables.

### 5. The Postgres path, decided now

When ADR-0011 clears (Supabase Pro + Branches), the collection moves to Postgres in one slice:

1. **Tables keep the document shape.** `journal_entries (id uuid pk, user_id text, schema_version int, doc jsonb, tried_at timestamptz, created_at, updated_at)` and `cellar_bottles (user_id text, brand_id int, schema_version int, doc jsonb, …, primary key (user_id, brand_id))`. The `doc` column holds exactly the JSON Redis holds today, so the same upcasters run in the Postgres adapters, and a record written before the move reads the same after it. Columns are extracted only where a query needs them (ordering by `tried_at`, the per-user index).
2. **Both tables are classified as `UserTable`** in `db-tables.ts` and read through `userQuery()` with RLS on `user_id = auth.jwt()->>'sub'` (ADR-0010).
3. **Postgres adapters** implement `JournalStore` and `CellarStore`. Call sites do not change.
4. **Backfill** = take a fresh backup, run the restore path against the Postgres stores, and compare record counts with the backup.
5. **Cut over** behind one env switch, keep the Upstash keys read-only for 30 days, then delete them.
6. Normalising `doc` into real columns is a later, ordinary SQL migration. It is also the point at which old upcasters can finally be deleted.

Nothing in §1–§4 has to be undone for this, which is the test the maintainer set for this ADR.

## Considered options

- **Postgres now.** Rejected for the same reason ADR-0020 rejected it: it needs Pro + Branches first. §5 is written so that waiting costs nothing.
- **No versioning; make every new field optional.** Works until the first rename or a field changes meaning, and then fails silently, because the read path drops what does not parse. Versioning costs one integer per record and one function per change.
- **Migrate eagerly** (a script rewrites every record at deploy time). More moving parts and a deploy-ordering problem for one user's data. Lazy upcasting needs neither.
- **Detailed notes as their own store, keyed by entry id.** Two records for one tasting, with consistency to maintain between them. Rejected.
- **Back up to Upstash itself** (a second key, or a second database). It shares the failure we are protecting against. Rejected.
- **Back up to Vercel Blob.** Viable. Rejected only because Supabase is already provisioned and covered by a DPA.

## Consequences

- Every stored-record schema change from now on is a `schemaVersion` bump with an upcaster and its unit test. Code review checks for it.
- Deployments can be rolled back safely: a record written by newer code is not destroyed by older code. It is kept, skipped, and still backed up.
- ADR-0009's RoPA gains a Cellar row and a backup row. A backup copy is kept for at most 30 days, so an erasure request is handled by deleting the user's keys **and** their backup prefix. The in-app "clear journal" keeps the backups on purpose, so that an accidental clear can be undone for 30 days.
- Two operational prerequisites must be met on Production: `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` set, and the Vercel cron registered. Until they are, the backup route answers 503 and `journal:export` remains the backstop.
- ADR-0020 is amended, not superseded: its access model, its port, and its migration target stand. This ADR fills in the record format, the backup, and the steps of the migration.
