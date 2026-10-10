---
title: ADR-0025 — Own bottlings: one record, a third collection store, export format 3
status: accepted
date: 2026-10-10
amends: ADR-0024
---

# ADR-0025: Own bottlings — one record, a third collection store, export format 3

## Context

Until now everything a User could log pointed at a **Sake** — a Sakenowa brand, the *line*. Two things did not fit.

- **A sake the catalogue does not have.** The scan reads a label, finds no match, and design v1.5 §5a offers "Keep it anyway"; search offers "Add it yourself". Both need somewhere to put a name that has no brand id.
- **A specific bottling of a sake the catalogue does have.** Rihaku is a line; "Wandering Poet" is what is in the glass. Sakenowa has no such level (CONTEXT.md, **Expression**).

Design v1.6 (answer B2) settles the shape: **an own entry is an own bottling** — one record, `own: true`, `line: null | lineId`. v1.6.1 settles the launch state: there are no catalogue bottlings, so the only Expressions that exist are the ones a User adds.

## Decision

### 1. One record: an own Expression

`ExpressionSchema` (`src/lib/schemas/expression.ts`), v1:

```
{ schemaVersion: 1, id, own: true, brandId: number | null, line: { nameKanji, nameRomaji } | null,
  name, brewery?, createdAt, updatedAt }
```

- **`brandId` is the line.** `null` means the Sake is unknown. `line` holds the line's name, denormalised for the reason a JournalEntry denormalises its sake, and is present exactly when `brandId` is.
- **`brewery` is kept only without a line.** With one, the brewery is the catalogue's.
- **`own: true` is a literal.** A catalogue Expression — curated by hand, each fact with a source, visible to everyone — is a different record with a different home (a public table). It will get its own schema rather than turn this one into a two-mode record.
- **No `source` field.** The record is the User's own words, shown only to them and labelled "Your own entry" wherever it renders. It is never presented as catalogue fact, so ADR-0005's taxonomy does not apply — the same reading that leaves a JournalEntry's note without one.
- **Linking later is a field change.** If the Sake turns up in the catalogue, `brandId` and `line` are set and `brewery` dropped. No migration, no second record kind. This is the reason the design chose "own bottling" over "own entry".
- Grade, rice, polishing and size are the expected **v2** (§10's "About the sake" will set them). They are left out of v1 because no screen asks for them.

### 2. A third store, `ExpressionStore`

Same port + in-memory + Upstash pattern as `JournalStore` and `CellarStore` (ADR-0024 §1): one Redis hash per user, `expressions:user:<clerkUserId>`, field = Expression id. Maintainer-only, behind the same gate (ADR-0020); `withMaintainerCollection` hands the three stores out together.

A store of its own, not a field on a tasting, because an Expression exists before its first tasting ("Add your bottling"), is shared by every tasting and cellar row of it, and is renamed in one place.

### 3. Export format 3

```
{ formatVersion: 3, exportedAt, userId, journal, cellar, expressions, rejected }
```

- The reader accepts format 1 and 2 files (no Expressions) and refuses any version it does not know.
- **Restore writes Expressions first**, so a restore that stops halfway never leaves a tasting pointing at a bottling that is not there yet.
- The daily backup, `pnpm journal:export`, `pnpm journal:restore` and `pnpm journal:erase` all cover the third store. Erasure drops the user's `expressions:` key with the other two, and their backups.

### 4. What points at an Expression — next, not here

This ADR adds the record, its store and its place in export, backup, restore and erasure. Nothing references an Expression yet. The slices that follow each bump a version, as ADR-0024 §2 requires:

- **JournalEntry v3** (landed with §9a's page) — a tasting may be logged against an Expression: an optional `expression: { id, name }`, the name denormalised like the sake's. One without a line has no brand and no flavor position: it is recorded and counted, and the Palate fold skips it, exactly as it skips a chartless Sake today.
- **CellarBottle v2** — one row per thing a bottle was logged against (design v1.6.1, answer 3), so the row's key stops being the brand id.

### 5. The Postgres path is unchanged

ADR-0024 §5 applies as written, with a third table of the same document shape: `expressions (user_id text, id uuid, schema_version int, doc jsonb, …, primary key (user_id, id))`, classified `UserTable`, behind RLS.

## Considered options

- **A second record kind for "own entry"**, beside bottlings. Two shapes to export, erase and render, and a migration the day an own entry turns out to be a bottling of a known Sake. Rejected by the design, and by this ADR for the same reason.
- **Embed the bottling in each JournalEntry.** No third store, but the name is copied into every tasting and every cellar row, a rename touches all of them, and a bottling with no tasting yet cannot exist.
- **Put own Expressions in Postgres now.** Needs the first `user_id` table, which ADR-0011 still blocks.

## Consequences

- ADR-0009's RoPA gains an Expressions row; the backup row and the Upstash vendor row name the third store.
- The export envelope is at format 3. A format-3 file cannot be restored by a deployment older than this ADR; it refuses it rather than misreading it.
- CONTEXT.md's **Expression** entry now distinguishes the own Expression (built) from the catalogue Expression (not built, no data source).
