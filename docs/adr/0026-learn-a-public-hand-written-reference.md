---
title: ADR-0026 — "Learn": a public, hand-written reference outside the age gate
status: accepted
date: 2026-10-11
amends: ADR-0006
---

# ADR-0026: "Learn" — a public, hand-written reference outside the age gate

## Context

Design v1.6 §18 draws a reference on what a label and a bottle mean: an index and entry pages (title with kanji and romaji, a short answer, facts, detail, sources, related entries). It left two decisions open, as not the designers' to settle:

- **Open decision 9** — public, or behind the 18+ gate. §18 is drawn for both.
- **Open decision 10** — the name. "Sake guide" was a working name pending a collision check.

Until now ADR-0006's rule was simple: nothing about sake renders before the 18+ confirmation.

## Decision

The maintainer decided both on 2026-10-11.

### 1. The reference is public

`/learn` and every entry under it sit outside the 18+ gate and outside the app shell, in the `(site)` route group. They can be linked to and indexed.

This is compatible with JMStV §6(5) and ADR-0006 because of what the pages hold, and the line is drawn there:

- **Allowed on a Learn page:** hand-written explanation of terms, processes, grades and rice varieties, with its sources. Education about a category.
- **Never on a Learn page:** a sake's name, a brewery's, a flavor chart, a ranking, a recommendation, a tasting note, a price, a shop. Anything that is about a product stays in the app, behind the gate. §18's "Sakes of this style" is exactly that and is not on the public page; if it is built, it lives in the app.
- **Copy rules** are ADR-0006's, unchanged: discovery and learning only. No purchase prompts, no claims about health or effects, no depiction of drinking. `entries.test.ts` checks the catalogue for the obvious offenders.

The gate's allowlist (`UNGATED_LOCALE_PATHS`) is exact-match; Learn adds one prefix rule beside it, `isPublicContentPath`, so the exception is named rather than a list of fourteen paths.

**Only in a launched locale.** `/de/learn` is German-language content, and ADR-0008 holds German pages back until the Impressum is in place. The proxy rewrites a Learn path in a non-launched locale to the coming-soon page, like any gated path. The German text ships in the catalogue now, as ADR-0007 requires, and appears when `de` launches.

### 2. The name is "Learn"

"Learn" in English, **"Wissen"** in German. Both are plain words rather than a coined name, so there is nothing to collide with (ADR-0004's lesson was about a proper name). The route is `/learn` in both locales.

### 3. Every entry is hand-written from named sources

- An entry's **structure** — slug, group, kanji, romaji, facts, related entries, sources — is `GuideEntrySchema` (`src/lib/schemas/guide-entry.ts`), listed in `src/lib/guide/entries.ts`. Its **words** are in `messages/{en,de}.json` under `learn.entries.<slug>`.
- **`source` is always `manual_curation`** (ADR-0005), and the schema admits nothing else. No entry is model-written; a reference that needed an "AI-written" badge would not be one.
- **Each entry names at least one source** and carries `verifiedOn`, the day it was last checked against them. The page prints both.
- **Where sources disagree, the entry says so.** Koshu has no legal minimum age, and the makers' association gives two years in one place and three in another; the entry reports both.
- Primary sources are preferred: the National Tax Agency's labelling standard, the Japan Sake and Shochu Makers Association, the National Research Institute of Brewing.

## Considered options

- **Behind the gate.** Simpler to reason about, and what ADR-0006 said. But it hides the one part of the product that is plainly education, and nothing on these pages is what the gate exists to keep from minors.
- **Public, with sakes listed under each entry.** That is product data in front of the gate. Rejected; see §1.
- **Long-form content in MDX files** rather than the message catalogue. It would escape the parity test that keeps German from falling behind, and ADR-0007 says user-facing strings go through next-intl.

## Consequences

- ADR-0006's rule now reads: no **sake data** before the 18+ confirmation. Learn pages hold none, and a PR that puts some there breaks this ADR.
- Adding an entry is a three-part change — `entries.ts`, `en.json`, `de.json` — and `entries.test.ts` fails if they disagree.
- The in-app ways in are Account → Learn, "How to read a label" on every scan outcome, and the landing footer. §18's other entry points (the camera link, guide-linked grade tags, "Learn more" in info sheets) are not built: the first is a layout change on the tightest screen, the second needs catalogue bottlings, the third needs entries that do not exist yet.
- No personal data is involved.
