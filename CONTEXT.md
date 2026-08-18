# Yawaragi

A sake companion — **Yawaragi** (和らぎ, "the water drunk between sake sips"; cf. *yawaragi-mizu*, 和らぎ水). Helps users recognise, discover, and track the sake they enjoy through three flagship surfaces: label scan, chat recommender, and taste profile. The adopted next direction (ADR-0020) reframes the taste profile around a **tasting journal** as the spine — with the **TasteMap** as its derived output view — and adds search (#234). The tasting journal now ships as a **maintainer-only private beta** (the public still sees the anonymous, ephemeral taste-profile example); the deterministic search (#234) is not yet shipped as its own surface.

Previously named "Kanpai"; renamed to avoid collision with KANPAI London Craft Sake Brewery. See `## Naming` below and ADR-0004.

## Language

**Sake**:
A sake product line (銘柄, *meigara*) produced by a single Brewery — e.g. "Dassai", "Kubota Senju". The unit of recommendation, scanning, and taste-profile vectors. Sakenowa's API calls this `brand`; we deliberately rename to avoid collision with the colloquial English meaning ("the brand" = the company).
_Avoid_: Brand, Label, Meigara, Product

**Brewery**:
The company that produces Sakes (酒蔵, *sakagura*). Matches Sakenowa's `brewery` 1:1.
_Avoid_: Sakagura, Kuramoto, House, Producer

**Prefecture**:
A Japanese administrative region — one of the 47 prefectures (e.g. Niigata, Yamaguchi). Sakenowa calls this `area`; we rename for precision and to reserve "Region" for future broader climate groupings (Tōhoku, Kansai, etc.).
_Avoid_: Area, Region

**FlavorProfile**:
The continuous 6-tuple attached to a Sake, describing its position along the Sakenowa aroma/body/dryness axes. Axes are `hanayaka`, `hojun`, `juko`, `odayaka`, `dry`, `keikai` (each a float in `[0, 1]`). Used for vector similarity ("sake similar to this one") and positioning, **not** for hard filters like "sweet" or "umami". Sakenowa's `flavorChart` (f1..f6) with canonical romaji + kanji + English-approximation labelling. See the [6-axis vocabulary](#6-axis-vocabulary) table.
_Avoid_: FlavorChart, TasteVector, FlavorMap

**FlavorAxis**:
One of the six fixed axes of a FlavorProfile, identified by romaji name: `hanayaka` (華やか), `hojun` (芳醇), `juko` (重厚), `odayaka` (穏やか), `dry` (ドライ), `keikai` (軽快). Closed enum — never extended. English labels are *approximations only*, not canonical identifiers.
_Avoid_: f1..f6 (storage detail only), flavor dimension, taste axis

**FlavorTag**:
A discrete categorical tag attached to a Sake from Sakenowa's 117-tag vocabulary (e.g. `甘味` sweet, `旨味` umami, `酸味` acidic, `フルーティ` fruity). Used for hard filters and chat-driven queries that the 6-axis FlavorProfile cannot answer. A Sake has zero or more FlavorTags.
_Avoid_: Tag (too generic), FlavorLabel, FlavorAttribute

**TasteProfile**:
A *User*'s aggregated preference, derived from their **TasteEvents**. Lives in our own data, not Sakenowa. Mirrors the FlavorProfile shape (6 axes) plus a weighted set of preferred FlavorTags. Never stored as a snapshot — always recomputed from the TasteEvents, so it stays reproducible and erasable. Its user-facing rendering is the **TasteMap**.
_Avoid_: UserProfile (collides with auth), FlavorProfile (that's the Sake's, not the User's), Preference, TasteVector (that's the derived 6-axis result, not the profile), "taste profile" as a *user-facing* label (retired per ADR-0020 — users see the "taste map")

**TasteMap**:
The user-facing name for the six-axis radar view of a *User*'s **TasteProfile** — the picture of their palate. A *derived output view* of the **TastingJournal**, not its own surface. Distinct from the journal (a list of what you tried) and from a Sake's **FlavorProfile** (the sake's own axes). Retires the earlier interchangeable "taste profile" / "taste map" copy.
_Avoid_: taste profile (that's the internal TasteProfile object), flavor map, palate chart

**TasteEvent**:
A single dated interaction that feeds a *User*'s **TasteProfile**: a Sake rating, an accepted scan result, or a cross-beverage seed. Each carries a *signed strength* — a direction (toward or away from a FlavorProfile position) and a magnitude. A User has zero or more TasteEvents; the TasteProfile is the combination of them. A **JournalEntry** is a TasteEvent plus richer fields (see **TastingJournal**).
_Avoid_: Interaction (too generic), Rating (only one of the three kinds), Signal, PreferenceEvent

**TastingJournal**:
A *User*'s durable, ordered record of Sakes they have tried — the **spine surface** everything else hangs off (per ADR-0020). A **JournalEntry** *is* a **TasteEvent** plus richer fields: free-text `notes`, an explicit `tried_at`, the denormalised sake display name (kanji + romaji, captured at log time so the record survives a catalogue change), and (later) a scan reference. The **TasteMap** and recommender are *downstream outputs* of the journal. Persistence is auth-gated and maintainer-only in v1; the public sees an interactive-but-ephemeral example (ADR-0020). EN "tasting journal" / DE "Verkostungsjournal".
_Avoid_: Log (clinical), Diary (personal-emotional), Cellar / Shelf (implies owning bottles, not tastings), History (too generic)

**Ranking**:
A single Sake's position-and-score within a popularity list, for a specific month. Scope is either *overall* (global top 100) or a single Prefecture (regional top N). A Sake has zero or more Rankings: it may appear in overall, in its Brewery's Prefecture, in both, or in neither. The `year_month` records which monthly snapshot the position came from. We store only the latest snapshot — never historical.
_Avoid_: Rank, Position, PopularityRank

**Provenance** (Source):
The origin of any piece of information shown to a user. Every record carries a `source` field drawn from a closed enum (see [Provenance taxonomy](#provenance-taxonomy)). Some records also carry a `confidence` (0..1). The recommender, the chat agent, and every UI surface are required to respect provenance — Sakenowa-sourced facts and LLM-inferred facts are visually distinguished, and cross-beverage mappings carry a heuristic disclaimer.
_Avoid_: Origin, Trust, Confidence (confidence is a separate field, not a synonym for provenance)

**CrossBeverageMap**:
A hand-curated deterministic table that bridges Western beverage descriptors (e.g. "smoky", "tannic", "agave-smoky", "juniper-botanical") to positions on the 6-axis FlavorProfile. Not a scientific mapping — a heuristic for cross-domain recommendations. The schema's `beverage` enum (`src/lib/schemas/cross-beverage-map.ts`) is the source of truth for covered categories. Always rendered with `<HeuristicDisclaimer />`. The LLM may not invent new entries beyond the table. The map is bidirectional: the *forward* direction resolves a descriptor a visitor types into a FlavorProfile position (which Sakes match it); the *reverse* direction takes a Sake's FlavorProfile and names the nearest Western **Exemplar** ("interesting for those who like Riesling"). Both directions carry `source: cross_beverage_map` and the heuristic disclaimer; reverse may legitimately return *no* Exemplar when a Sake sits far from every descriptor (a distinctly Japanese profile with no close Western analog).
_Avoid_: BeverageBridge, CrossDomainMap, BeverageTranslation

**Exemplar**:
A recognisable, named Western drink (e.g. "Riesling Kabinett", "Lagavulin 16", "Sancerre") curated onto a CrossBeverageMap descriptor so the reverse direction can speak in familiar terms instead of abstract descriptor names. Editorially resurrected from the cross-beverage research artifact (`docs/research/cross-beverage-map.md`) where these named anchors originally lived before being averaged into descriptor clusters. Source `manual_curation`. A descriptor has one or more Exemplars; the reverse suggestion surfaces the one or two nearest.
_Avoid_: Anchor (overloaded — the research doc's raw exemplars are also "anchors"), Reference drink, Analog

## Relationships

- A **Sake** is produced by exactly one **Brewery**
- A **Brewery** produces zero or more **Sakes**
- A **Brewery** is located in exactly one **Prefecture**
- A **Sake** has exactly one **FlavorProfile**
- A **Sake** has zero or more **FlavorTags**
- A **User** has zero or more **TasteEvents**
- A **User** has exactly one **TasteProfile**, derived from their **TasteEvents** (never stored as a snapshot)
- A **Sake** has zero or more **Rankings** (at most one *overall*, at most one per its Brewery's Prefecture, both for the current month only)
- Every displayed record carries a **Provenance** (source + optional confidence)

## 6-axis vocabulary

Authoritative table for the six FlavorAxes. Romaji + kanji are canonical identifiers; English/German are user-facing approximations only.

| Axis | Romaji   | Kanji   | English approximation | German approximation | Caveat                                  |
|------|----------|---------|-----------------------|----------------------|------------------------------------------|
| f1   | hanayaka | 華やか   | fragrant / floral     | duftig / blumig      | not "perfumed"; aromatic-ester-driven    |
| f2   | hojun    | 芳醇    | mellow / rich         | vollmundig / reich   | not "creamy"; umami-and-aroma depth      |
| f3   | juko     | 重厚    | heavy / full-bodied   | schwer / körperreich | not "tannic"; weight + amino acid        |
| f4   | odayaka  | 穏やか   | mild / calm           | mild / sanft         | restrained aroma, not "neutral"          |
| f5   | dry      | ドライ   | dry                   | trocken              | closest 1:1; tracks SMV broadly          |
| f6   | keikai   | 軽快    | light / crisp         | leicht / spritzig    | refreshing finish, low residual          |

These axes are derived from Sakenowa's NLP of >1M Japanese-language reviews; the vocabulary reflects Japanese palate descriptors and does not always map cleanly to Western flavor language. The f1–f6 → Japanese-label mapping above was verified on 2026-05-22 against Sakenowa's published data documentation at https://muro.sakenowa.com/sakenowa-data. The Sakenowa Data API itself returns only numeric `f1..f6`; the labels come from Sakenowa's accompanying type docs.

Two transcription errors had been circulating across earlier drafts of this repo and are now corrected here for the record: (a) f5 and f6 were swapped (the published order is f5=ドライ, f6=軽快); (b) the romaji for 軽快 is **keikai**, not "karoyaka" (which is the reading of the unrelated word 軽やか).

## Provenance taxonomy

Every record displayed to a user carries a `source` field. Values:

- **`sakenowa`** — fetched directly from the Sakenowa Data API. Canonical, attribution required.
- **`sakenowa_inferred`** — derived from Sakenowa data via deterministic math (e.g. cosine similarity over FlavorProfile vectors). Still trustworthy; the derivation is reproducible.
- **`llm_extracted`** — produced by a vision LLM from a user-uploaded label image. Always has a confidence score. Renders with `<ProvenanceBadge />` and an "improve / report" affordance.
- **`llm_inferred`** — LLM reasoning over Sakenowa tool results (e.g. a chat answer citing a tool call). Renders with `<ProvenanceBadge />`.
- **`cross_beverage_map`** — produced by the hand-curated CrossBeverageMap. Renders with **both** `<ProvenanceBadge />` (identifies the source kind) **and** `<HeuristicDisclaimer />` (carries the "Western descriptors don't translate exactly" failure-mode caveat). See ADR-0005 §"deterministic-but-heuristic source" for the rationale.
- **`user_corrected`** — a User has overridden any of the above. Always wins over its prior source.
- **`manual_curation`** — hand-written content owned by maintainers (glossary entries, fixed mappings).

## Naming

The project's name is **Yawaragi** (和らぎ). It refers to *yawaragi-mizu* (和らぎ水), the water drunk between sake sips to reset the palate and pace consumption — culturally analogous to the app's role as companion and clarifier.

Previously the project was called "Kanpai". That name was abandoned because KANPAI London Craft Sake Brewery (Tom & Lucy Wilson, Bermondsey, founded 2016) operates under the same name in the same European sake community the project hopes to engage. The collision created confusion risk, trademark risk, and a poor first impression with potential allies. The single word "kanpai" itself is also generic ("cheers") and saturated globally, making SEO essentially impossible.

The decision and its alternatives are recorded in `docs/adr/0004-project-name-yawaragi.md`; the full research is in `docs/NAMING-RESEARCH.md`.

The open-source MCP server has a deliberately decoupled name: **`sakenowa-mcp`**, published as `@yawaragi/sakenowa-mcp`. This honours Sakenowa's attribution requirement, follows the ecosystem convention `@<author>/<service>-mcp`, and keeps the OSS asset useful to other developers regardless of any future product rebrand.

## German legal framework (summary)

Yawaragi targets Germany / DACH as a primary market. Key constraints (full detail in [`docs/adr/0006-age-gate-jmstv.md`](./docs/adr/0006-age-gate-jmstv.md), [`docs/adr/0008-en-first-launch-strategy.md`](./docs/adr/0008-en-first-launch-strategy.md), [`docs/adr/0009-gdpr-compliance-posture.md`](./docs/adr/0009-gdpr-compliance-posture.md), and the pre-go-live checklist):

- **JMStV §6(5)** — alcohol advertising must not target or appeal to minors. Enforced by the [Age gate](#age-gate).
- **MStV §8(10)** — no promotion of excessive consumption.
- **JuSchG** — self-declared 18+ is sufficient for information products; an Altersverifikationssystem (AVS) is required only for DTC purchase or adult content.
- **GDPR** — lawful basis required (consent for personalisation, legitimate interest for the public catalogue); minimise image retention on the scan flow. See [Lawful basis](#lawful-basis), [DPA](#dpa--sccs), [RoPA](#ropa).
- **§5 DDG** — Impressum required (DDG replaced TMG in May 2024; the obligation is materially unchanged). Deferred until DACH launch — see [Launched locale](#launched-locale--coming-soon).
- **Sakenowa licence** — attribution required; "Flavor Chart" is Sakenowa's registered trademark.

## Phase 0 compliance vocabulary

**Age gate**:
The JMStV §6(5) self-declared 18+ modal shown on first visit, persisted in the `yawaragi_age_gate` cookie (1-year expiry, versioned `{v, ts}` payload). No flavor data, brand pages, recommendations, or label scans render before acceptance. Distinct from the [Cookie banner](#cookie-banner) — different legal regime (JMStV vs GDPR), different UX (modal vs bottom banner), different cookie. See `docs/adr/0006-age-gate-jmstv.md`.
_Avoid_: Age check, 18+ wall (modal is the canonical UX), Compliance modal

**Cookie banner**:
The GDPR consent surface (bottom-anchored, never modal). Three actions (Accept all / Reject non-essential / Customize) with no pre-ticked boxes and equal-prominence buttons. Persisted in the `yawaragi_consent` cookie with `{necessary, analytics, marketing, version}`. A persistent footer link reopens the banner pre-filled with the current decision (the "withdraw as easily as you gave" rule, Art. 7(3)). Bumping `CURRENT_CONSENT_VERSION` re-prompts everyone. Distinct from the [Age gate](#age-gate).
_Avoid_: Cookie modal (it's a banner), Consent popup, GDPR popup

**Anonymous session**:
A signed opaque session identifier issued by the proxy middleware (`src/proxy.ts` → `src/lib/session/middleware-issue.ts`) on a visitor's first request to any gated route, persisted in the `yawaragi_session` cookie (24h TTL from issuance). The middleware is the SOLE writer; server actions and route handlers only READ the cookie to derive the rate-limit key. Used together with a transient hashed-IP fallback as the rate-limit key — neither identifier is ever written to Postgres or logs; both live only in Edge KV. The same identifier serves multiple paid-API surfaces under one [lawful basis](#lawful-basis): legitimate interest in cost protection of the vision and LLM APIs. Distinct from the [Age gate](#age-gate) (JMStV; acceptance gate) and the [Cookie banner](#cookie-banner) (GDPR consent surface).
_Avoid_: Scan cookie, Visitor id, Anonymous user (we do not have users without auth — there are visitors with anonymous sessions)

**Lawful basis**:
The GDPR Article 6 ground that legitimises a personal-data processing operation. Allowed values for this project: `consent` (Art. 6(1)(a)), `contract` (6(1)(b)), `legitimate_interest` (6(1)(f)), `legal_obligation` (6(1)(c)). Documented per record type in Zod schemas or in [RoPA](#ropa). No processing without a documented basis — see `docs/adr/0009-gdpr-compliance-posture.md`.
_Avoid_: Legal ground (correct German "Rechtsgrundlage" but lawful basis is the GDPR English term), Justification

**RoPA**:
Records of Processing Activities — the table in ADR-0009 listing every personal-data processing operation, its lawful basis, retention, residency, and vendor. Treated as code: every PR that adds, removes, or modifies a processing operation updates RoPA in the same diff.
_Avoid_: Privacy log, Processing register, Data inventory

**DPA / SCCs**:
Data Processing Agreement (the contract a controller signs with each processor — Vercel, Clerk, Supabase, Anthropic, Langfuse). Standard Contractual Clauses (the EU-approved boilerplate that legitimises cross-border data transfers, required for any non-EU processor since Schrems II). Per ADR-0009, a DPA is a **blocking dependency** — a vendor cannot be integrated until the DPA is signed and, if applicable, SCCs are in place.
_Avoid_: Vendor contract, Subprocessor agreement

**Launched locale / coming soon / `LAUNCHED_LOCALES`**:
The launched-locale set is `new Set(['en'])` today; `/de/` renders a coming-soon page until the Impressum (§5 DDG) is in place. Defined in `src/i18n/launch-state.ts`, used by both `src/app/[locale]/page.tsx` and `src/proxy.ts`. The DACH launch flips `'de'` into the set in one line. See `docs/adr/0008-en-first-launch-strategy.md`.
_Avoid_: Active locale (collides with the visitor's current locale), Public locale, Enabled locale

## Flagged ambiguities

- Sakenowa exposes a sentinel `areaId: 0` named "その他" (Other) for Breweries with no assigned prefecture. We keep it as a Prefecture row to avoid orphaned Breweries, but it is not a real prefecture and should be excluded from any geographic ranking or filter UI.
- **Sweet, umami, and acidic are NOT FlavorAxes.** Sakenowa's 6-axis FlavorProfile measures aroma/body/dryness, not the canonical sommelier dimensions. Sweet ≈ inverse of `dry` *but* has its own discrete FlavorTag (`甘味`, id:12). Umami and acidic live only as FlavorTags (`旨味` id:5, `酸味` id:2). When a user asks for "sweet sake", the recommender must filter by FlavorTag, not by FlavorProfile. When asked for "sake similar to this one," it must use FlavorProfile, not tags.
- **FlavorTag and FlavorAxis overlap semantically.** `辛口` (dry) is both an axis (`dry`/f5) and a tag (id:3). `フルーティ` (fruity) overlaps with `hanayaka` (f1). When both surfaces disagree, prefer the tag for hard filters and the axis for similarity. Never expose the redundancy to users.
- **Same-romaji collisions are possible across Breweries and Sakes.** Two distinct Japanese names (e.g. 旭酒造 / 朝日酒造) may transliterate to the same `name_romaji`. Search must disambiguate using Prefecture, the `name_ja` field, or both. Do not assume `name_romaji` is unique.
- ~~The f1..f6 → Japanese-label mapping above is unverified against Sakenowa directly.~~ **Resolved 2026-05-22**: mapping verified against Sakenowa's published data documentation at https://muro.sakenowa.com/sakenowa-data. The Sakenowa Data API returns numeric `f1..f6` only; the labels come from Sakenowa's accompanying type docs. The earlier internal write-up had f5/f6 swapped and used the wrong romaji ("karoyaka" for 軽快, which actually reads "keikai"); both are corrected throughout the repo. The Sakenowa outreach email is still worth sending to confirm the English/German approximations are acceptable for public copy, but the canonical f1..f6 identifiers are no longer in doubt.

## Naming convention

Every entity sourced from Sakenowa that carries a human-readable label (**Sake**, **Brewery**, **Prefecture**, **FlavorTag**) has two name columns:

- **`name_ja`** — the original Japanese (kanji/kana). Source of truth. What label-scan OCR matches against.
- **`name_romaji`** — Latin-alphabet transliteration. What users type in search and what the chat agent speaks. Mixed-case for display.

Prefectures use a static 47-entry lookup. Sake and Brewery transliterations are generated by an LLM at ingest time, **only when the row is new or `name_ja` has changed**. A separate `name_romaji_override` table (keyed by Sakenowa id) wins over LLM output and is hand-curated for popular sakes.
