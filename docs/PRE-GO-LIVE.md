# Yawaragi — Pre-Go-Live Checklist and Build-Plan Additions

> **Status (2026-05-22):**
> - **§1 (CLAUDE.md additions)** folded into `/CLAUDE.md`. The text below is the source-of-truth record of what was added; the live constraints live in `CLAUDE.md`.
> - **§2 (CONTEXT.md additions)** folded into `/CONTEXT.md`.
> - **§3 (ADRs)** executed: ADR-001 (naming) → `docs/adr/0004-project-name-yawaragi.md`; ADR-002 (provenance) → `docs/adr/0005-source-provenance.md`; ADR-003 (age gate) → `docs/adr/0006-age-gate-jmstv.md`; ADR-004 (i18n) → `docs/adr/0007-i18n-en-de.md`.
> - **§4–§7** remain forward-looking — the phase tickets, the Phase 7.5 community plan, and the pre-go-live checklist itself are not yet executed.
> - The project was renamed from "Kanpai" to **Yawaragi** during this ingestion. "Kanpai" appears below only where the historical name is load-bearing (the Kanpai London collision; the original ADR-001 discussion).
>
> **Update (2026-05-24):** Launch strategy is now EN-first; `/de/` renders a coming-soon page until the Impressum (§5 TMG / §5 DDG) is in place. See [ADR-0008](./adr/0008-en-first-launch-strategy.md). The pre-go-live checklist's Legal & compliance section (§7.1) treats Impressum as the **last gate** before any DACH-reachable deployment.

This document folds the market-research caveats into the build plan as **build-time constraints** (so they shape every PR rather than being bolted on at the end) and **a pre-go-live gate** (so nothing ships publicly until it's earned).

---

## 0. Reading guide

Three artefacts to maintain together:

1. **`CLAUDE.md` additions** (§1 below) — paste into your existing `CLAUDE.md` so every Claude Code session respects them. These are mostly *anti-patterns* and *conventions* that constrain what gets built.
2. **`CONTEXT.md` additions** (§2 below) — paste into the project glossary so domain decisions are visible to every session.
3. **New ADRs** (§3 below) — four architectural decisions that need to be recorded and referenced.

Then:

4. **Per-phase ticket additions** (§4) — concrete new issues to add to each phase of the build plan.
5. **A new Phase 7.5 — Community** (§5) — sits between Polish (Phase 7) and any public launch.
6. **Session-ritual additions** (§6) — two small additions to your start-of-session and end-of-session checklists.
7. **The pre-go-live checklist itself** (§7) — hard gates that must all be green before any public announcement.

---

## 1. `CLAUDE.md` additions (paste into the existing file)

Add the following sections to your `CLAUDE.md`, outside the auto-generated Next.js blocks so they survive framework updates.

### 1.1 Provenance is mandatory on every datum

```markdown
## Source provenance

Every piece of information shown to a user must carry an explicit `source` field.
The taxonomy is:

- "sakenowa"           — fetched from Sakenowa Data API (canonical)
- "sakenowa_inferred"  — derived from Sakenowa via deterministic math (e.g. cosine similarity)
- "llm_extracted"      — produced by an LLM (vision label scan, generated tasting note)
- "llm_inferred"       — LLM reasoning over Sakenowa data (chat answer citing tools)
- "cross_beverage_map" — deterministic table-driven cross-beverage bridge
- "user_corrected"     — user has overridden the value
- "manual_curation"    — hand-curated by maintainers (glossary, fixed mappings)

Rules:
- Zod schemas in src/lib/schemas/ include `source` (and optionally `confidence: 0..1`)
  on every record type.
- UI components render a small provenance badge near any displayed value sourced
  from "llm_extracted", "llm_inferred", or "cross_beverage_map". Use the
  <ProvenanceBadge source={...} /> component (Phase 2).
- Never blend sources silently. A recommendation card showing 4 facts from
  Sakenowa and 1 from the LLM must visually distinguish them.
- LLM-generated tasting notes never appear without an "AI-written" badge and
  an "report" / "improve" affordance.
```

### 1.2 Sakenowa attribution is a first-class UX element

```markdown
## Sakenowa attribution

Sakenowa data is free under an attribution-only licence. Footer attribution is
NOT sufficient.

- The <SakenowaAttribution /> component must appear on every page that
  displays flavor data, brand data, or rankings sourced from Sakenowa.
- Placement: above the fold on dedicated detail pages (e.g. /sake/[brandId]);
  inline near the data on pages where Sakenowa is one of multiple sources
  (e.g. /chat, /me).
- The component links to https://sakenowa.com and includes the phrase
  "Powered by Sakenowa".
- "Flavor Chart" is a Sakenowa registered trademark — when referring to the
  6-axis visualisation in product copy, use "flavor chart (Sakenowa)" or
  the German equivalent on first mention per page.
```

### 1.3 The 6-axis vocabulary is Japanese, not English

```markdown
## 6-axis flavor vocabulary

The Sakenowa f1..f6 axes are Japanese brewers' terms with no exact English
equivalent. NEVER render them with only an English label.

The canonical mapping (also in CONTEXT.md) is:

  f1 hanayaka (華やか)  ~ "fragrant / floral"   — but NOT "perfumed"
  f2 hojun    (芳醇)   ~ "mellow / rich"       — but NOT "creamy"
  f3 juko     (重厚)   ~ "heavy / full-bodied" — but NOT "tannic"
  f4 odayaka  (穏やか)  ~ "mild / calm"
  f5 dry      (ドライ)  ~ "dry"                 — closest to a 1:1 mapping
  f6 keikai   (軽快)   ~ "light / crisp"

Rules:
- The <FlavorAxisLabel /> component shows the romaji name, the kanji, and the
  English/German approximation with a tooltip explaining "This is a brewer's
  term; the English label is an approximation."
- Never use only the English approximation in a UI element.
- In LLM prompts, instruct the model to use the romaji name + kanji in
  tasting notes, with the English approximation parenthetical.
```

### 1.4 Cross-beverage bridging is heuristic, label it as such

```markdown
## Cross-beverage disclaimers

The cross-beverage map (whisky/wine/beer → 6-axis) is a hand-curated
heuristic, not a scientific mapping.

- Every cross-beverage recommendation MUST render with the
  <HeuristicDisclaimer /> component (Phase 5), which shows:
  "Cross-beverage mappings are approximations. Western descriptors like
  'smoky' or 'tannic' have no direct sake equivalent."
- The chat tool `mapCrossBeverage` always returns the source field set to
  "cross_beverage_map" so the UI can detect and render the disclaimer.
- Do not let the LLM invent new cross-beverage mappings beyond the
  deterministic table.
```

### 1.5 Age gate and JMStV compliance

```markdown
## Age gate and JMStV compliance (Germany)

Yawaragi is a sake information and education tool. Germany's JMStV §6(5) and
MStV §8(10) restrict alcohol marketing to minors.

- A self-declared 18+ confirmation modal is shown on first visit and persisted
  in a cookie (1-year expiry). No sake data, brand pages, recommendations,
  or label scans render until accepted.
- Self-declaration is sufficient for an information/discovery product.
  IF Kanpai ever adds direct purchase or DTC affiliate checkout, escalate to
  a KJM-approved Altersverifikationssystem (AVS) — this is a Phase-8 decision,
  not now.
- Copy is non-promotional throughout. NEVER use phrases like:
    "buy now", "don't miss", "limited time", "exclusive offer",
    "Vergiss nicht zu kaufen", "Nur heute", "Verpasse nicht"
  Always use discovery/learning framing:
    "discover", "learn", "explore", "entdecken", "erfahren", "kennenlernen"
- Never show drinking, never imply social/sexual/professional success from
  consumption, never imply medicinal benefit. (JMStV §6(5) and the German
  Advertising Council guidelines.)
- The cookie banner and 18+ gate live in src/components/legal/ and are
  validated against the JMStV checklist in docs/adr/0006-age-gate-jmstv.md.
```

### 1.6 Internationalisation from day one

```markdown
## i18n (English + German from day one)

- All user-facing strings go through next-intl. No inline literals in JSX.
- Default locale: en. Second locale: de.
- Japanese kanji is preserved verbatim alongside both locales (it's not a
  "translatable" string, it's part of the data).
- A locale switcher lives in the header. Default detection uses
  Accept-Language; user choice persists in a cookie.
- New components without German translations DO NOT MERGE. The PR template
  has a "i18n" checkbox.
```

### 1.7 Anti-patterns (extend the existing list)

```markdown
## Anti-patterns — additions

- Do NOT display flavor or recommendation data before the 18+ gate has been
  accepted.
- Do NOT show LLM-extracted data without a provenance badge.
- Do NOT render English labels for the 6 flavor axes without the romaji+kanji
  + tooltip.
- Do NOT show cross-beverage results without the heuristic disclaimer.
- Do NOT use promotional copy (see §1.5).
- Do NOT merge a component with English-only strings.
- Do NOT let the LLM invent cross-beverage mappings beyond the deterministic
  table.
- Do NOT reintroduce "Kanpai" outside the deliberate historical exceptions
  (docs/adr/0004, docs/NAMING-RESEARCH.md, CONTEXT.md Naming section).
```

---

## 2. `CONTEXT.md` additions (paste into glossary)

```markdown
## Provenance taxonomy

(See CLAUDE.md §1.1 for the canonical taxonomy. Brief glossary entries:)

- **Sakenowa-sourced**: data fetched from the Sakenowa Data API or derived
  from it via deterministic math.
- **LLM-extracted**: produced by a vision LLM from a user-uploaded label
  image. Always has a confidence score.
- **LLM-inferred**: LLM reasoning over Sakenowa tool results (e.g. a chat
  answer that cites a tool call).
- **Cross-beverage map**: deterministic table-driven mapping from
  whisky/wine/beer descriptors to the 6 axes; hand-curated.
- **User-corrected**: a user has overridden any of the above.
- **Manual curation**: hand-written content (glossary entries, fixed terms).

## 6-axis flavor vocabulary

(Authoritative table; UI components reference this.)

| Axis | Romaji   | Kanji   | English approximation | German approximation | Caveat                                  |
|------|----------|---------|-----------------------|----------------------|------------------------------------------|
| f1   | hanayaka | 華やか   | fragrant / floral     | duftig / blumig      | not "perfumed"; aromatic-ester-driven    |
| f2   | hojun    | 芳醇    | mellow / rich         | vollmundig / reich   | not "creamy"; umami-and-aroma depth      |
| f3   | juko     | 重厚    | heavy / full-bodied   | schwer / körperreich | not "tannic"; weight + amino acid        |
| f4   | odayaka  | 穏やか   | mild / calm           | mild / sanft         | restrained aroma, not "neutral"          |
| f5   | dry      | ドライ   | dry                   | trocken              | closest 1:1; tracks SMV broadly          |
| f6   | keikai   | 軽快    | light / crisp         | leicht / spritzig    | refreshing finish, low residual          |

These axes are derived from Sakenowa's NLP of >1M Japanese-language reviews;
the vocabulary reflects Japanese palate descriptors and does not always map
cleanly to Western flavor language.

## German legal framework (summary; see ADR-0006)

- **JMStV §6(5)**: alcohol advertising must not target or appeal to minors.
- **MStV §8(10)**: no promotion of excessive consumption.
- **JuSchG**: self-declared 18+ is sufficient for information products;
  Altersverifikationssystem (AVS) is required for DTC purchase / adult content.
- **GDPR**: lawful basis (consent for personalisation, legitimate interest
  for the public catalogue); minimise image retention on scan flow.
- **Sakenowa**: attribution required; "Flavor Chart" trademark belongs to
  Sakenowa.

## Naming

The project was previously named "Kanpai", which collided with KANPAI London
Craft Sake Brewery (Bermondsey, UK, est. 2016). Resolved by rename to Yawaragi —
see docs/adr/0004-project-name-yawaragi.md and docs/NAMING-RESEARCH.md.
```

---

## 3. New ADRs

> **Executed 2026-05-22.** The templates below are preserved as the historical proposal record. The realised ADRs live at: ADR-001 → [`docs/adr/0004-project-name-yawaragi.md`](./adr/0004-project-name-yawaragi.md), ADR-002 → [`docs/adr/0005-source-provenance.md`](./adr/0005-source-provenance.md), ADR-003 → [`docs/adr/0006-age-gate-jmstv.md`](./adr/0006-age-gate-jmstv.md), ADR-004 → [`docs/adr/0007-i18n-en-de.md`](./adr/0007-i18n-en-de.md). Always read the realised files; the templates below may have drifted from the final decisions.

Four ADRs to create in `docs/adr/`. Templates below — fill in the chosen option.

### ADR-001 — Project naming and KANPAI London Craft Sake Brewery

```markdown
# ADR-001: Project naming and KANPAI London Craft Sake Brewery

## Status
[Decided | Pending] — date

## Context
"Kanpai" is the project's working name. KANPAI London Craft Sake Brewery
(Tom & Lucy Wilson, Bermondsey, since 2016) operates under the same name
in the same broader sake space. Kanpai London has a taproom, runs events,
and is well known in the European sake community — exactly the audience
this project hopes to engage. A name collision risks:
  - confusion in the community
  - trademark conflict
  - poor first impression with potential allies
  - SEO / search disambiguation problems

## Options considered
1. Keep "Kanpai" and reach out to Kanpai London proactively — preserve the
   working name on the assumption goodwill can be earned.
2. Rebrand to a non-conflicting name (candidates: "Sakeology", "Kura",
   "Tokkuri", "Sakemap", "Kikisake", "Hanayaka", "Kanpai Companion").
3. Defer the decision — soft-launch under a working name and decide later.

## Decision
[Fill in.]

## Consequences
- If 1: send outreach email to Tom Wilson before any public artefact uses
  the name. Include a one-paragraph "what this is, why it's different,
  what I'm asking for" message. Update this ADR with the outcome.
- If 2: update repo name, domain registration, brand assets, social handles,
  README, all docs. Re-run `grep -ri kanpai` and update everywhere.
- If 3: working name everywhere is internal-only until decision is made.
  No public artefact (blog, demo, Sake On Air pitch) ships first.
```

### ADR-002 — Source provenance model

```markdown
# ADR-002: Source provenance on every datum

## Status
Decided — [date]

## Context
LLM-augmented apps routinely blur model output and ground-truth data, which
(a) misleads users, (b) makes hallucinations invisible, (c) creates
ethical and trust problems, and (d) is the single pattern hiring managers
grill candidates on most often.

## Decision
Every record type in src/lib/schemas/ includes a `source` enum and an optional
`confidence` field. The taxonomy is documented in CLAUDE.md §1.1 and
CONTEXT.md. UI components render a <ProvenanceBadge /> wherever non-canonical
sources are displayed.

## Consequences
- Phase 2 schemas grow by one or two fields.
- Phase 3 (label scan) writes both the raw LLM extraction AND the matched
  Sakenowa brand, with sources distinguished.
- Phase 4 (chat) tool results carry their source through to the rendered card.
- Phase 5 (taste profile) records which rating event came from which source.
- The /dev page exposes a "provenance audit" view showing what % of displayed
  facts in the last 7 days came from each source — a strong portfolio signal.
```

### ADR-003 — Age gate strategy under JMStV

```markdown
# ADR-003: Age gate strategy (JMStV / JuSchG compliance)

## Status
Decided — [date]

## Context
Germany's JMStV §6(5) restricts alcohol advertising aimed at minors. The
JuSchG / KJM distinguish between information products (lower threshold)
and adult content / DTC sales (higher threshold; AVS required).

Kanpai in its v1 form is an information and education product — not a
storefront, not an adult-content site. A self-declared 18+ gate is the
de-facto industry standard for this category and is what wine/spirits
information sites in Germany use.

## Decision
- Self-declared 18+ modal on first visit; persisted in a cookie (1y expiry).
- No flavor data, brand pages, recommendations, or scan results render
  before acceptance.
- Non-promotional copy throughout (see CLAUDE.md §1.5).
- The gate triggers AVS escalation IF AND WHEN Kanpai adds:
  - direct purchase (DTC) — out of scope for v1
  - affiliate checkout that completes inside the Kanpai UI — out of scope
  - any user-generated content that could be classified as advertising

## Consequences
- A small component (src/components/legal/AgeGate.tsx) plus middleware to
  block all routes except `/`, `/about`, `/privacy`, `/imprint`.
- The cookie banner is separate from the age gate (one is GDPR, the other
  is JMStV).
- Imprint (Impressum) is required by §5 TMG; add to footer.
```

### ADR-004 — i18n strategy

```markdown
# ADR-004: English and German UI from day one; next-intl

## Status
Decided — [date]

## Context
The primary geographic targets are (a) global English-speaking sake-curious
audiences and (b) Germany / DACH. Building English-only and back-filling
German is the standard mistake; the cost of i18n added later is
disproportionately high in a component-heavy Next.js app.

## Decision
- next-intl from Phase 0.
- Default locale: en. Second locale: de.
- All user-facing strings go through useTranslations / getTranslations.
- Japanese kanji is preserved verbatim alongside both locales (data, not
  strings).
- A locale switcher in the header; Accept-Language detection; cookie
  persistence.
- A PR template checkbox "i18n: all new strings translated to de" — strict.

## Consequences
- ~1 hour added to Phase 0.
- Components ship with two .json message catalogues.
- Translation can be done by Claude in plan mode (a small German-fluent
  reviewer pass is recommended before public launch — see Phase 7.5).
```

---

## 4. Per-phase ticket additions

Add the following tickets to your existing phase backlog.

### Phase 0 — Environment

- `[P0-09] (DONE 2026-05-22) Naming resolved → Yawaragi; see ADR-0004. Stage-2 follow-ups tracked in that ADR.`
- `[P0-10] next-intl setup; locale switcher; en + de message catalogues`
- `[P0-11] <AgeGate /> component + route middleware blocking sake content before acceptance`
- `[P0-12] Cookie banner (GDPR) — separate from age gate`
- `[P0-13] Impressum page (§5 TMG)`

### Phase 2 — Data foundation

- `[P2-09] Sakenowa attribution component + design tokens`
- `[P2-10] Add `source` and `confidence` fields to every Zod schema in lib/schemas/`
- `[P2-11] <ProvenanceBadge source={...} /> component + Storybook entries`
- `[P2-12] Expand CONTEXT.md glossary with the 6-axis vocabulary table (English + German + caveat)`
- `[P2-13] <FlavorAxisLabel /> component (romaji + kanji + approximation tooltip)`

### Phase 3 — Label scan

- `[P3-08] Persist raw LLM extraction AND matched Sakenowa brand with distinct sources`
- `[P3-09] "Was this scan correct?" affordance — write to a corrections table`
- `[P3-10] "AI-written tasting note" badge + "improve" / "report" affordances on the scan-result page`
- `[P3-11] German translations for the scan flow`
- `[P3-12] Operator has run `pnpm add-manual-brand` for the seed set of bottles missing from Sakenowa's frozen public dump (UMAMI confirmed, others as discovered during testing). Per ADR-0014, the manual-curation layer covers the gap until Sakenowa publishes a fresh dump (#129 follow-up).`
- `[P3-13] Vision provider env covers both tiers: `ANTHROPIC_API_KEY` serves `claude-haiku-4-5` (tier 1, default) AND `claude-sonnet-4-6` (tier 2, retry-on-failure). No second env var needed; both models are resolved through `getVisionProvider(...)` in `src/lib/ai/vision/registry.ts`. Tier-2 fires on every tier-1 result except a clean first-pass match; budget impact is bounded to hard bottles (~6× per-scan cost on those, unchanged on the happy path).`

### Phase 4 — Chat + MCP

- `[P4-12] Tool result cards display a <ProvenanceBadge />`
- `[P4-13] Glossary tooltip overlays in chat (hover any term defined in lookupTerm to see definition inline)`
- `[P4-14] System prompt instructs the model to use romaji + kanji for flavor axes, English/German parenthetical`
- `[P4-15] German translations for the chat flow + a "switch to English" inline link for kanji discussion`

### Phase 5 — Taste profile + cross-beverage

- `[P5-07] <HeuristicDisclaimer /> component mandatory on any cross-beverage result`
- `[P5-08] Corrections / brewery agency: a small "suggest a correction" UI on /sake/[brandId], routes to a corrections table reviewed in /dev`
- `[P5-09] German translations for /profile + cross-beverage form`

### Phase 6 — Evals + dev mode

- `[P6-07] /dev/corrections page — review pending user-submitted corrections`
- `[P6-08] /dev/provenance — % of displayed facts in last 7d by source (the audit view from ADR-0005)`
- `[P6-09] /dev/competitors — manually-curated page tracking SAKE AI and other relevant launches (last checked date, links, observations). A reminder to revisit every 2 weeks.`

### Phase 7 — Polish

- `[P7-04] Pre-go-live checklist run-through (see §7 of this document)`
- `[P7-05] Native-speaker review pass on German translations (humans only — not Claude)`
- `[P7-06] Lighthouse pass on /scan, /chat, /me, /sake/[brandId] in BOTH locales`

---

## 5. New Phase 7.5 — Community (sits between Polish and any public launch)

The build plan currently jumps from Phase 7 (Polish) to "blog post + LinkedIn". The market research argues the highest-leverage activity for both the portfolio goal AND the (optional) go-live goal is **community engagement before any broad public announcement**. Add a short Phase 7.5:

**Goal**: get qualified eyes on the product in the right small community before broadcasting.

**Tickets**:

- `[P7.5-01] Outreach email to Susanne Rost-Aoki (Sake Kontor Berlin) — "I built a tool, would love your feedback"`
- `[P7.5-02] Outreach email to Yoshiko Ueno-Müller (Ueno Gourmet, Hamburg)`
- `[P7.5-03] Outreach email to Natsuki Kikuya (Museum of Sake / WSET London)`
- `[P7.5-04] Outreach email to Marie Cheong-Thong (British Sake Association)`
- `[P7.5-05] Pitch a Sake On Air podcast guest spot (JSS-backed; explicitly platforms new sake-space builders)`
- `[P7.5-06] Post in the Japan Sake Community Discord (~400 members) and r/sake`
- `[P7.5-07] Submit @kanpai/sakenowa-mcp to the MCP server registry`
- `[P7.5-08] Apply to attend ProWein 2026 (15–17 March) as independent observer; identify JSS Hall 12 and JETRO Düsseldorf contacts in advance`

**Estimated time**: 6–8 hours total; spread over 2–3 weeks.

**Decision gate**: continue to public broadcast (blog + LinkedIn + HN) only after at least 2 of {Sake Kontor reply, Museum of Sake reply, podcast confirmation, MCP registry acceptance, Discord positive engagement}. This is the *Stage 2 conditional decision point* from the market research.

---

## 6. Session-ritual additions

### Add to §10.1 (Session start ritual)

After step 1 (`git pull && git status`), insert:

> 1a. *(once every two weeks)* Open `/dev/competitors` or check the SAKE AI App Store listing. Note any changes in `docs/competitor-log.md`. Takes 60 seconds; misses zero competitor moves.

### Add to §10.2 (Session end ritual)

After step 1 (`pnpm test && pnpm typecheck && pnpm lint`), insert:

> 1a. *Provenance & i18n check*: skim the diff. Did any new user-facing string land without German? Did any new component show non-canonical data without `<ProvenanceBadge />`? If yes, fix before committing.

This is intentionally a manual prompt rather than a lint rule — at 9pm on a Tuesday the prompt is what catches you, not the rule you forgot to write.

---

## 7. The pre-go-live checklist

A hard gate. **No public launch artefact** (blog post submitted, Show HN, LinkedIn announcement, Sake On Air recording, ProWein materials) ships until every item is green.

### 7.1 Legal & compliance

- [x] ADR-0004 (naming) is resolved — project renamed to Yawaragi (2026-05-22). Stage-2 trademark clearance still pending; see ADR-0004 Stage-2 action items.
- [ ] ADR-0006 (age gate) is implemented; verified that no sake content renders before acceptance.
- [ ] Impressum (§5 TMG / §5 DDG) page is live and accurate.
  - **Page structure ships during Phase 0 (issue #4 / Slice 3) with placeholder `name` / `address` / `email` values.** Real values are deliberately deferred — the maintainer will not disclose personal home address. Plan: subscribe to an Impressum service (impressum-service.de, Tribee, or equivalent) for a usable postal address, then backfill `messages/{en,de}.json` and ship.
  - **This is the LAST item to complete before the DACH launch.** Per [ADR-0008](./adr/0008-en-first-launch-strategy.md), the project ships publicly as EN-first; `/de/` renders coming-soon until this gate is green. Flipping DE live = subscribe to the service, fill in the Impressum/Privacy copy in `messages/{en,de}.json`, add `'de'` to `LAUNCHED_LOCALES` in `src/app/[locale]/page.tsx`. Until then, the EN-only deployment can ship on a `.dev` / `.app` / `.com` domain — the §5 DDG "directed at Germany" test is weak in that configuration.
- [ ] GDPR-compliant privacy policy and cookie banner are live; cookie banner is functionally separate from age gate. See [ADR-0009](./adr/0009-gdpr-compliance-posture.md) for the full posture.
  - [ ] **Lawful basis** documented (in Zod schema or ADR-0009 RoPA) for every record type that holds personal data.
  - [ ] **DPAs in force** with every third-party vendor that processes personal data: Clerk, Supabase, Anthropic, Langfuse, Vercel (or wherever the app is hosted). For each non-EU vendor, **SCCs** are also in place. "In force" covers both countersigned-PDF and ToS-incorporated DPAs: Supabase countersigns via PandaDoc, Vercel + Clerk are auto-incorporated through their Standard Terms at signup (Clerk's countersigned PDF is Enterprise-only per Clerk support 2026-06-01 — see #93). Archive the DPA URL + version + DPF certification reference for each vendor as the paper trail of record.
  - [ ] **Data residency** declared per vendor (EU/US); EU region selected where the vendor offers it (Supabase, Langfuse).
  - [ ] **Privacy policy** in `messages/{en,de}.json` covers every processing operation in the RoPA — vendor names, categories of data, retention, lawful basis, contact for data subject requests.
  - [ ] **Cookie banner UX audit:** no pre-ticked boxes; Accept and Reject buttons of equal prominence; withdraw flow (footer settings link) reopens the banner pre-filled. Manual click-through in both locales.
  - [ ] **Data subject rights endpoints reachable** for an account holder: access (export), rectification, erasure (with cascade verified), portability (JSON export), objection. End-to-end test from a real account.
  - [ ] **Retention policies** are implemented, not just declared: cron job or runtime guard discards data past its documented retention window (label-scan images discarded immediately; Langfuse traces 30 d; inactive accounts pruned after 24 months).
  - [ ] **Records of Processing Activities (RoPA)** table in ADR-0009 has been updated to match the current code state (one row per processing operation).
  - [ ] **Breach notification runbook** exists at `docs/runbooks/breach-notification.md` (Art. 33 + Art. 34 paths; 72-hour clock).
  - [ ] **Contact email** for data subject requests is published in the privacy policy and the Impressum.
  - [ ] **No special-category data** (Art. 9) is collected. Verified by code review of the data model.
  - [ ] **Lawyer review** completed: a German IT/data-protection lawyer has reviewed the privacy policy, cookie banner copy, RoPA, and DPA chain (~€200–400 flat fee).
- [ ] LLM image processing on scan flow does not retain images beyond the inference call (verified by reading the API client code).
- [ ] No promotional copy anywhere (manual scan: search the codebase and translations for "buy", "kaufen", "limited", "exclusive", "exklusiv", "miss", "verpass").
- [ ] Terms of Service page is live and references the Sakenowa data licence.

### 7.2 Attribution & ethical UX

- [ ] `<SakenowaAttribution />` renders above the fold on every page that displays Sakenowa-sourced data. Verified by hitting all major routes.
- [ ] "Flavor Chart" is consistently attributed to Sakenowa (trademark).
- [ ] Every page that displays LLM-generated content shows a `<ProvenanceBadge />` near that content.
- [ ] LLM-generated tasting notes have a visible "AI-written" badge AND an "improve / report" affordance.
- [ ] Every cross-beverage result renders with the `<HeuristicDisclaimer />`.
- [ ] Every 6-axis label renders with romaji + kanji + tooltip.
- [ ] User-submitted corrections are persisted and reviewable in `/dev/corrections`.

### 7.3 Internationalisation

- [ ] No English-only user-facing strings remain. `pnpm i18n:audit` returns clean.
- [ ] A German-fluent human (not Claude) has reviewed the German catalogue end-to-end. Translation errors of the form "literal-but-wrong" have been corrected.
- [ ] Locale switcher works; Accept-Language detection works; cookie persistence works.
- [ ] Kanji is preserved alongside both locales on every brand and brewery display.

### 7.4 Accessibility & quality

- [ ] Lighthouse scores ≥90 on Performance and Accessibility for `/`, `/scan`, `/chat`, `/sake/[brandId]`, `/me` in BOTH locales.
- [ ] Keyboard navigation works on every interactive surface; focus rings visible.
- [ ] All images have meaningful alt text (German and English).
- [ ] Error states never show a stack trace; always a next-action.
- [ ] Empty states have real copy in both locales.

### 7.5 Evals & trust

- [ ] All three golden sets (label extraction, recommender, glossary) are passing at the documented thresholds.
- [ ] The judge model is documented (Opus) and is different from the production model (Sonnet).
- [ ] `/dev/evals` is publicly viewable and shows the latest pass rates with timestamps.
- [ ] `/dev/provenance` audit view is publicly viewable.
- [ ] At least 30 days of Langfuse traces exist in production so the dev view is non-empty.

### 7.6 Community sign-off (Phase 7.5 gate)

- [ ] At least 2 of: Sake Kontor reply, Museum of Sake reply, podcast confirmation, MCP registry acceptance, Discord positive engagement.
- [ ] No negative response from a community contact that hasn't been addressed in product or in copy.
- [ ] At least one community contact has used the product end-to-end and given feedback.

### 7.7 Technical

- [ ] Cost ledger (`/dev/cost`) shows < €15/month at current usage with a documented per-user rate-limit headroom.
- [ ] `CRON_SECRET` rotated since first deployment.
- [ ] `/api/cron/ingest` has fired successfully at least once in production via the scheduled GET path (Vercel Cron sends GET, not POST) — verified via `SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1` returning a recent `status='success'` row whose timestamp falls inside a scheduled-hour window, NOT a stale row from a manual POST smoke. Catches the silent non-2xx failure mode where Vercel Cron daily-loops against a route that 405s (method mismatch), 401s (CRON_SECRET drift), or 5xxs without any visible alert.
- [ ] Supabase RLS policies verified end-to-end on `user_taste_vectors` and corrections.
- [ ] `ANTHROPIC_API_KEY` is the production key, has spend limits, and is NOT present in any shell config or local `.env` checked into git.
- [ ] Vercel deployment uses `pnpm` not `npm` (consistency with local).
- [ ] `robots.txt` allows indexing of `/`, `/about`, `/blog/*` only; disallows `/dev`, `/me`, `/scan`, `/chat` (avoid accidental indexing of personal pages).
- [ ] **Plan-tier audit per vendor** ([deploying.md §5](./deploying.md#5-plan-tiers--hobby-vs-professional)). Each free/hobby tier has its own commercial-use rules:
  - [ ] **Vercel** is on **Pro** (Hobby is explicitly non-commercial; any production-grade launch crosses the line)
    - [ ] **On Vercel Hobby → Pro upgrade: DPA acceptance re-verified under the new tier scope.** The Vercel DPA self-executes via the main Agreement (Section 1 + Schedule 3 §3.vi), but Hobby's general ToS arguably incorporates the DPA less forcefully than Pro/Enterprise. After the upgrade goes through, visit <https://vercel.com/legal/dpa> and confirm the version + effective dates haven't changed; archive a fresh snapshot for the paper trail.
  - [ ] **GitHub** plan covers the Actions minutes used by CI (Pro / Team if private repo + active development)
  - [ ] **Supabase** project is on a tier that matches expected DB/storage/MAU
    - [ ] **SOC 2 Type 2 report accessible.** Per the executed Supabase DPA §9.8, SOC 2 / ISO 27001 reports substitute for the (paper-only) audit right in §9.3-9.4. SOC 2 reports are gated to **Team / Enterprise** tier per Supabase docs — Free and Pro do NOT have access. Upgrading at the `public-launch` milestone is the moment to verify the report is downloadable from Organization → Documents.
  - [ ] **Clerk** is on a tier that matches expected MAU (Free covers up to 50,000 MAU as of 2026; paid Pro starts at $25/mo + $0.02/MAU above 10k). Pro tier note: countersigned PDF of the DPA remains Enterprise-only — auto-incorporation via ToS stays the paper trail until then.
  - [ ] Any other added vendor (Langfuse, Sentry, Cloudflare, etc.) has been re-audited against the table in deploying.md

### 7.8 Portfolio / recruiter

- [ ] README is the recruiter document (one screenshot, one sentence, live demo link, blog post link, architecture diagram).
- [ ] Repo is pinned on GitHub profile.
- [ ] LinkedIn headline reflects the AI-augmented frontend positioning.
- [ ] Blog post is drafted and links the live demo, the GitHub repo, the MCP repo, and `/dev/evals`.
- [ ] Commit log is human-readable (no "Generated by Claude" or 🤖 mentions).

---

## 8. Mapping — what changed from the original plan

A quick before-after for your reference.

| Original plan section | Now reads / now includes |
|---|---|
| Phase 0: Environment setup | + naming ADR + i18n setup + age gate + cookie banner + Impressum |
| Phase 2: Data foundation | + Sakenowa attribution component + provenance schemas + flavor axis component |
| Phase 3: Label scan | + corrections flow + AI-written badge + German translations |
| Phase 4: Chat + MCP | + provenance badge in cards + glossary tooltips + romaji+kanji in prompts |
| Phase 5: Taste profile | + heuristic disclaimer + brewery agency / corrections |
| Phase 6: Evals + dev mode | + corrections review + provenance audit + competitor log |
| Phase 7: Polish | + pre-go-live checklist run-through + human German review + Lighthouse in both locales |
| (new) Phase 7.5: Community | community outreach before broadcast |
| Phase 7: Polish + blog | → Phase 7 (Polish) + Phase 7.5 (Community) + Phase 8 (Public broadcast, conditional) |
| Anti-patterns in CLAUDE.md | extended with provenance, attribution, vocabulary, disclaimer, JMStV, i18n |

The total added effort is roughly **15–20 hours** spread across phases. Most of it lands in Phase 0 (i18n, age gate, naming) and Phase 2 (provenance, attribution components) where it costs least; the rest is small additions to existing tickets.

---

## 9. Why this works

Three things to internalise:

1. **Provenance is the unifying primitive.** Six of the twelve gaps collapse into one design decision: every datum carries its source. Get that right in Phase 2's schemas and the UX badges, tooltips, disclaimers, and corrections all fall out naturally.

2. **Constraints in `CLAUDE.md` survive context resets; constraints in your head don't.** The plan's whole structural premise is "compensate for Claude's amnesia and your own context-loss". The caveats above are exactly the kind of thing that gets forgotten at 9pm on a Tuesday — encoding them in `CLAUDE.md` is the only durable fix.

3. **The pre-go-live checklist is a forcing function, not a wishlist.** It exists to make "go live" a decision that has been earned, not a button that gets pressed when the code looks done. If you can't honestly tick every box, the answer is "not yet" — and that's a successful use of the checklist.
