# Naming the Sake Companion App & MCP Server
### Strategic Research Report — May 2026

---

## Executive Summary

**Drop "Kanpai" entirely.** The collision with KANPAI London Craft Sake Brewery (Tom & Lucy Wilson, founded 2016, Druid Street, Bermondsey) is unavoidable in the target EU market. They run Europe's first sake taproom, have 12K Instagram followers, supply 100+ UK venues, and own kanpai.london plus @kanpailondon. "Kanpai Companion" would only invite confusion with the exact community the app wants to engage. The word "kanpai" itself is also generic ("cheers") and saturated globally.

**Recommended primary name: Yawaragi (和らぎ).** It refers to the water drunk between sips of sake — culturally meaningful, mission-aligned (companion/balance), pronounceable for English and German speakers, and free of a dominant brand owner. Pair it with the descriptive MCP package name **`sakenowa-mcp`** (published as `@yawaragi/sakenowa-mcp`) so the open-source server stays attribution-clear and useful to other developers.

**Backup name if pure English clarity is preferred: Saketrail.** Free of brand conflicts, instantly readable, and aligns with the "discovery journey + travelers to Japan" framing — but its descriptive nature makes it harder to trademark and easier for competitors to crowd.

---

## 1. Why "Kanpai" Must Go

### 1.1 The KANPAI London problem

KANPAI London is not just a brewery — it is a node in the European sake education ecosystem this app wants to join. They run weekly Saturday brewery tastings, Ikebana × sake collaborations, an aged-honjozo sherry-cask release line, and the KURAFUTO Japanese craft market. Tom Wilson's journey (first prize in a Gekkeikan-sponsored cooking competition → one week at Gekkeikan Kyoto → founding the UK's first sake brewery) is itself a well-known story in the community. Time Out, The Nudge, and Hot Dinners all reference "Kanpai" as London's sake brewery.

Any name beginning with "Kanpai" — including "Kanpai Companion," "Kanpai Guide," or "Kanpai App" — will create direct confusion in exactly the markets (UK, Germany, EU sake scene) where credibility is most needed.

### 1.2 The generic problem

"Kanpai" means "cheers" and is the single most commonly borrowed Japanese drinking word in Western culture. Searching for it returns thousands of results across restaurants, bars, podcasts, festivals, and media properties globally. SEO is essentially impossible.

---

## 2. Competitive Name Landscape — What's Already Taken

Several obvious English-compound and Japanese-term candidates are already occupied in adjacent sake categories:

| Candidate | Status | Conflict |
|---|---|---|
| **Sakenote** | ❌ Taken | iOS/Android sake-tasting-log app by SonicGarden Inc. (Japan), sakenote.com, @Sakenote2012 on X |
| **Sakemap / SAKEMAP** | ❌ Taken | sake-map.com — active Japanese sake information site |
| **Sakedo / SAKE DŌ** | ❌ Taken | Sake World Association's 酒道 certification program at sakedo.net (SENSEI / 門下生 ranks) |
| **Sakeology** | ❌ Taken | Niigata University Sakeology Center — the world's first academic discipline for sake, formalised 2017, campus centre opened April 2021. Using it commercially would clash with a major academic institution. |
| **Sakelog** | ⚠️ Weak | sake-log.jp is an active Japanese review blog; github.com/sakelog occupied |
| **Sakepath** | ⚠️ Risky | "SAKE PATH" is a sake-kasu cosmetics product (Tohokushinsha/Kimura Shuzo's Fukukomachi line, Sept 2023) |
| **Kikisake** | ❌ Taken | SSI-certified sommelier rank (利き酒師); co-opting it without accreditation is disrespectful to the 50,000+ certified kikisake-shi globally |
| **Kura** | ❌ Crowded | Kura Sushi (multi-billion-dollar chain), Brooklyn Kura (USPTO #5454399 by Gotham Sake LLC), multiple EU/JP filings |
| **Tsunagu** | ❌ Saturated | tsunagu Japan travel media (870K+ Facebook followers), TsunAgu restaurant (Kagurazaka), github.com/making/tsunagu, the tsunagu.network humanitarian project |
| **Shirube** | ⚠️ Crowded | Shirube USA izakaya group (Santa Monica + Tokyo), Masaharu Fukuyama "Michi Shirube" song, plus "酒標/さけしるべ" — an active Japanese sake subscription-box from Sakura Saketen |

---

## 3. Cultural Sensitivity — Terms to Avoid as Western Brand Names

Some terms in the candidate pool are titles, ranks, or certifications in Japan. Using them as a Western brand name would be equivalent to a non-Italian app calling itself "Sommelier":

### Off-limits terms

- **Kikisake / Kikisake-shi (利き酒師)** — the certified-sommelier rank conferred by the Sake Service Institute (SSI International) since 1991. The community you want as evangelists holds this certification.
- **Toji (杜氏)** — the master-brewer title. Using it implies a claim to the craft.
- **Sakedo (酒道)** — the "way of sake," a Kamakura-era discipline parallel to chadō (茶道, tea ceremony). The Sake World Association explicitly relaunched this as a movement.
- **Kuchikami (口噛み)** — refers to "mouth-chewed sake," an ancient Shinto-ritual brewing practice (popularised by the film *Your Name*). Using this as a consumer brand would be tonally inappropriate.
- **Sakeology** — held by Niigata University since 2017/2021 as a formal academic discipline.

### Safe terms

These are common nouns or tasting vocabulary, not honorifics:

- **Yawaragi, Hanayaka, Hōjun, Jūkō, Odayaka, Karoyaka/Keikai, Kire, Fukumi-ka** — tasting vocabulary
- **Tokkuri, Ochoko, Sakazuki, Masu** — vessel names
- **Nihonshu** — generic word for sake (too generic for branding)

---

## 4. Ranked Shortlist — 8 Candidates Evaluated

### #1. Yawaragi (和らぎ) — ⭐ RECOMMENDED

**Meaning:** "Softening / harmony." In sake culture, "yawaragi-mizu" (和らぎ水) is the water drunk between sake sips to reset the palate and pace consumption — a concept the Japan Sake and Shochu Makers Association actively promotes.

**Why it works:**

- Mission-perfect metaphor: the app accompanies and clarifies sake, doesn't replace it
- Pronounceable for EN/DE speakers (yah-wa-RA-gee)
- No dominant brand owner — generic sake-culture vocabulary
- Clear on npm
- Distinctive enough to trademark in software classes
- Looks good in a wordmark and URL

**Drawbacks:**

- Minor pop-culture noise (a Naruto character shares the name)
- A small Tokyo sake bar uses "Yawaragi" but in a different category (food service, not software)
- Meaning isn't self-evident to absolute beginners — needs a tagline

**Suggested tagline:** *"Your between-sips guide to Japanese sake."*

**MCP fit:** `@yawaragi/sakenowa-mcp` reads cleanly.

---

### #2. Saketrail — STRONG BACKUP

**Meaning:** English compound; evokes the brewery-trail / discovery-journey aspect.

**Why it works:**

- Instantly comprehensible globally
- Pronounceable by anyone
- No brand collisions found
- Maps neatly to cross-beverage bridging ("Islay → sake" is a "trail" between traditions)
- Perfect for the traveler-to-Japan use case

**Drawbacks:**

- Descriptive English compounds are weakly trademarkable
- Competitors could launch "SakeTrails," "Sake-Trail.com" etc.
- Less culturally resonant; carries none of the Japanese craft DNA
- Risks sounding like a content site rather than a product

**MCP fit:** `@saketrail/sakenowa-mcp` works.

---

### #3. Fukumi-ka (含み香) — STRONG WILDCARD

**Meaning:** The aroma perceived while sake is in the mouth — the retronasal "what the mouth holds." A tasting-vocabulary term, not a title.

**Why it works:**

- Technically perfect for a label-scan + flavor-decoding app
- Sake professionals would immediately get it
- Highly distinctive

**Drawbacks:**

- Hard to pronounce for English speakers (foo-KOO-mee-ka)
- Obscure even to many enthusiasts
- "Fukumi" alone collides with Fukumi Restaurant Group (US, sake-adjacent) and with the `@fukumi/*` npm scope (`rhooks` React-hooks package already published there)

**Verdict:** A connoisseur's pick that will under-perform on word-of-mouth.

---

### #4. Hanayaka (華やか)

**Meaning:** The first of the six Sakenowa flavor axes — "fragrant / floral."

**Why it's tempting:** Direct connection to the data model; beautiful word.

**Why it doesn't work as the master brand:** Tying the whole product to one flavor axis biases the offering and conflicts with the cross-axis recommender mission. Better as an in-app feature/section name.

---

### #5. Kire (切れ)

**Meaning:** The clean finish of sake; crispness.

**Why it's tempting:** Short, punchy, authentic tasting term.

**Why it doesn't work:** Too opaque for Western users. Sounds like an English word ("keer" or "kire") and will be mispronounced. No dominant brand conflict but also no marketing lift.

---

### #6. Kanpai Companion — DO NOT USE

Even with the differentiator, "Kanpai" is the first word users will read, search, and remember. Marketing budget will be spent defining it as "not the London brewery." Social handles (@kanpaiapp, @kanpaicompanion) will be one DM away from the brewery's @kanpailondon.

---

### #7. Tsunagu (繋ぐ, "to connect/bridge") — DO NOT USE

Conceptually strong for cross-beverage bridging. Wildly oversubscribed: tsunagu Japan travel media (870K+ Facebook followers), TsunAgu restaurant, multiple apps, github repos, and humanitarian projects. Brand will be invisible.

---

### #8. Shirube (しるべ/導, "guide / signpost") — RISKY

Beautiful, on-mission word. But: Shirube USA izakaya group, "Michi Shirube" J-pop song, and "酒標/さけしるべ" — an active Japanese sake subscription-box. Too crowded.

---

## 5. MCP Server Naming — Separate Recommendation

### Recommendation: `sakenowa-mcp`

Published as `@yawaragi/sakenowa-mcp` on npm. Repo at `github.com/yawaragi/sakenowa-mcp`.

### Reasoning

1. **Attribution-friendly.** Sakenowa's data API requires acknowledgment; embedding "sakenowa" in the package name discharges that obligation by default and respects the upstream data provider.
2. **Discoverability.** A dev searching npm for "sakenowa" lands on your package. A dev searching for "sake mcp" also surfaces it.
3. **Ecosystem convention.** Anthropic-maintained servers use `@modelcontextprotocol/server-<service>` (filesystem, github, memory, postgres, brave-search, puppeteer). Third-party pattern is `@<author>/<service>-mcp`. Your package fits this expectation.
4. **Decoupled from consumer brand.** If the consumer app name changes, the MCP server keeps its independent identity.

### Naming to avoid for the MCP server

- `kanpai-mcp` — name collision
- `nihonshu-mcp` — too generic
- `sake-mcp` — overpromises (sake data ≠ Sakenowa data specifically)
- `<consumer-brand>-mcp` — locks the OSS asset to your product branding

### Usage pattern

```bash
npx -y @yawaragi/sakenowa-mcp
```

---

## 6. Domain & Handle Availability Summary

| Name | .app | .com | .io | npm scope | GitHub org | Social handles |
|---|---|---|---|---|---|---|
| **Yawaragi** | ✅ likely | ✅ likely | ✅ likely | ✅ clear | ✅ clear | ✅ likely |
| **Saketrail** | ✅ likely | ✅ likely | ✅ likely | ✅ clear | ✅ clear | ✅ likely |
| **Fukumi-ka** | ✅ w/ hyphen | ✅ w/ hyphen | ✅ w/ hyphen | ⚠️ `@fukumi` taken | ✅ clear | ⚠️ mixed |

**Caveat:** These are research-stage indicators based on absence of branded search results, NOT live WHOIS or registrar lookups. Final verification is required before committing to any name.

---

## 7. Sakenowa Data Note — f6 Axis Label Discrepancy

> **Resolved 2026-05-22.** Verified against Sakenowa's published data documentation at https://muro.sakenowa.com/sakenowa-data. The corrected mapping is below; the table previously here had **f5 and f6 swapped** and is preserved in git history. The original build plans also used the romaji "karoyaka" for 軽快 — that is the reading of the unrelated word 軽やか; 軽快 reads **keikai**. The canonical mapping now lives in `CONTEXT.md` § 6-axis vocabulary and `CLAUDE.md` § 6-axis flavor vocabulary; this section is kept as the historical record of when and how the discrepancy was first flagged.

The Sakenowa flavour axes as published are:

| Axis | Label | Kanji/Kana | English approximation |
|---|---|---|---|
| f1 | hanayaka | 華やか | fragrant / floral |
| f2 | hojun | 芳醇 | mellow / rich |
| f3 | juko | 重厚 | heavy / full-bodied |
| f4 | odayaka | 穏やか | mild / calm |
| f5 | dry | ドライ | dry |
| f6 | keikai | 軽快 | light / crisp |

**Outreach still useful:** Sakenowa may have preferred English/German labels for product copy; the canonical f1..f6 identifiers above are confirmed but the *approximations* are our choices.

---

## 8. Final Recommendation

### App name: **Yawaragi**

**Tagline:** *"Your between-sips guide to Japanese sake."*

The metaphor does the marketing work: this app is the water-between-cups — it doesn't compete with the sake, it accompanies and clarifies it. The name is respectful (everyday sake-culture vocabulary, not a title or honorific), pronounceable in English and German, free of dominant trademark owners, and unique enough to own in software.

### MCP server: **`sakenowa-mcp`**

Published as `@yawaragi/sakenowa-mcp` on npm. Open-source under MIT. README explicitly credits Sakenowa as the upstream data source, lists the 6-axis flavor vocabulary in both Japanese and English, and invites contributions.

---

## 9. Action Items

### Immediate (this week)

1. **Stop using "Kanpai" in any new material.**
2. **Reserve the name "Yawaragi" everywhere:**
   - Domains: yawaragi.app, yawaragi.io, yawaragi.dev
   - npm: `@yawaragi` scope
   - GitHub: `yawaragi` org
   - Social: @yawaragi or @yawaragiapp on Instagram, X, Mastodon, Bluesky
3. **Publish `@yawaragi/sakenowa-mcp` to npm** as a minimal stub (README + attribution) to claim the package name.
4. **File a preliminary EUIPO trademark application** in Class 9 (software) and Class 41 (education services) for "Yawaragi." Per EUIPO's fee schedule: €850 for the first class + €50 for the second = €900 total.

### Within 30 days

5. **Run formal trademark clearance:** EUIPO TMview, USPTO TESS, JPO J-PlatPat searches for "Yawaragi" in Nice Classes 9 and 41. Engage an IP lawyer or use Markify for a comprehensive search.
6. **Write a short blog post** (dev.to, Hashnode) introducing the `sakenowa-mcp` package — seed community awareness before competing names appear.
7. **Reach out informally** to Kanpai London (Tom & Lucy Wilson), Sake On Air, and the Niigata Sakeology Center introducing the project under the new name. Frame as collaboration, not competition.
8. **Contact Sakenowa** for written confirmation that "sakenowa-mcp" as a package name is acceptable under their attribution terms.
9. **Decide internal feature taxonomy:** use Hanayaka, Hōjun, Jūkō, Odayaka, Keikai, and Dry as in-app section/filter names (e.g. "Show me Hanayaka sake near you").

### Decision triggers

- **If WHOIS or EUIPO search reveals an active "Yawaragi" software trademark:** fall back to **Saketrail**.
- **If Sakenowa declines the `sakenowa-mcp` name in writing:** rename to `yawaragi-sake-mcp` and credit Sakenowa in the README.
- **If user testing shows <70% correct pronunciation of "Yawaragi" on first try:** add a phonetic guide to the homepage rather than rename, but consider Saketrail if problems persist.

---

## 10. Build Plan Integration

### Updates to make in project files

| File | Change |
|---|---|
| `CLAUDE.md` | Replace every instance of "Kanpai" with "Yawaragi" (or chosen name). Update the `## Project` header. |
| `CONTEXT.md` | Add a "Naming" section documenting the decision and the Kanpai London collision rationale. Add the corrected f6 axis label. |
| `docs/adr/ADR-001-naming.md` | Record the decision, the candidates evaluated, and the reasoning. |
| `docs/PRE-GO-LIVE.md` | Update the naming checklist item from "resolve ADR-001" to "confirmed: [chosen name]". |
| `package.json` | Update `name` field. |
| GitHub repo | Rename from `kanpai` to chosen name. |
| `apps/mcp/package.json` | Set name to `@yawaragi/sakenowa-mcp`. |
| `.env.example` / Vercel project | Update any project-name references. |
| README | Update all branding, links, and the recruiter narrative. |

### Phase 0 ticket addition

```
[P0-14] Execute naming decision:
  - Register domains (yawaragi.app, .io, .dev)
  - Create @yawaragi npm scope
  - Create yawaragi GitHub org
  - Claim social handles
  - Publish @yawaragi/sakenowa-mcp stub to npm
  - File EUIPO trademark application (Class 9 + Class 41)
  - Update all project files per naming table above
  - Write ADR-001
```

---

## Caveats

- **No live WHOIS or registrar lookups were performed** — final domain verification is required before committing to any name.
- **No formal trademark database queries** (EUIPO TMview, USPTO TESS, JPO J-PlatPat) were run. The cultural and commercial-use evidence above is from web research, not legal clearance. Engage an IP lawyer or trademark-search service before filing.
- **The Sakenowa f6 axis label discrepancy** ("karoyaka" in the build plans vs. "ドライ/dry" on the public API) is small but meaningful for product credibility. *(Resolved 2026-05-22 — see §7. The build plans had two errors: f5/f6 were swapped, and "karoyaka" was the wrong romaji for 軽快. Canonical mapping now in CONTEXT.md.)*
- **Pop-culture name collisions** ("Yawaragi" in Naruto) are unlikely to cause legal issues but may slightly affect initial Google search results. Monitor SERPs for the first 3 months.
- **Competitor apps WhatSake and Sakesho** are functionally close to the planned feature set. Differentiation must live in the product (MCP recommender, cross-beverage bridging, provenance model) rather than just the name.
- **The EUIPO trademark cost (€900)** is a real investment for a portfolio project. If budget is tight, defer the filing until the go-live decision is confirmed — but claim the domains and npm scope immediately (< €50 total) to prevent squatting.
