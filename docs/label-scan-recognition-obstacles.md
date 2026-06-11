# Label-scan recognition obstacles

A working catalogue of every obstacle we've hit on the path to reliably identifying a sake bottle from a phone photo and joining it back to a row in our Sakenowa-mirrored database.

Audience: ourselves, and (eventually) the blog-post series this seeds. Each entry is written so a reader without context can understand the shape of the problem, see a real example from our own testing, and follow the tracking link to the live work.

Scope: the **vision → kanji extraction → DB lookup** pipeline only. Camera-stack and capture-quality obstacles are listed at the bottom under "Capture-layer obstacles" since they're upstream of recognition but shape its failure modes.

Each entry has the same shape:

> **Name** — one line of headline.
> **What it is** — two or three sentences explaining the mechanism.
> **Example** — concrete case from our testing.
> **Status** — implemented fix, proposed fix, or open.
> **Tracking** — issue / PR / commit reference.

---

## 1. Brand vs SKU confusion

**What it is.** Sakenowa stores the brand line (`銘柄`) — e.g. `獺祭`. A real bottle label adds grade descriptors, polishing-ratio markers, and style modifiers — e.g. `獺祭 純米大吟醸 磨き45`. A vision model with no domain prior will happily extract the full visible string; an exact-match join then returns zero rows for any specific bottle.

**Example.** Operator photographs a Dassai bottle. Model returns `name_ja: "獺祭 純米大吟醸 磨き45"`. Sakenowa has `name_kanji: "獺祭"`. No match.

**Status.** Implemented. The `anthropic-haiku-provider.ts` SYSTEM_PROMPT carries an explicit strip list (grade descriptors, polishing-ratio markers, style modifiers, year/lot markers) plus three worked examples covering the dominant patterns.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), `src/lib/ai/vision/anthropic-haiku-provider.ts`.

---

## 2. Brewery legal-form suffix

**What it is.** Bottle labels print the brewery's full legal name — `旭酒造株式会社`. Sakenowa stores the operational name without the legal-form suffix — `旭酒造`. Same join-key problem as §1, different field.

The subtlety is that not every suffix gets stripped: `酒造`, `醸造`, `酒造場`, `酒造店` are part of the brewery's operational name and Sakenowa keeps them. Only the legal-form group (`株式会社`, `有限会社`, `合資会社`, `合同会社`) gets cut.

**Example.** Label says `旭酒造株式会社`. Sakenowa has `旭酒造`. Strip `株式会社`, keep the rest.

**Status.** Implemented in two layers:

1. **Prompt.** SYSTEM_PROMPT teaches stripping of legal-form markers (including PREFIXED `合同会社X`) AND preservation of operational suffixes (`酒造` etc). PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), `src/lib/ai/vision/anthropic-haiku-provider.ts`. Later tightened in PR #128 with explicit prefix examples after a 蔵王 trace showed the model dropping `合同会社`.

2. **Defensive lookup.** Even with the prompt explicit, the model drops operational suffixes inconsistently in production — a Takashimizu trace returned `高清水` (no suffix), `高清水酒造` (with), and `高瀬醸` (truncated) across attempts on the same bottle. `src/lib/sakenowa/brewery-variants.ts` expands a suffix-less brewery into the verbatim form + each suffix (`高清水` → `{高清水, 高清水酒造, 高清水醸造, 高清水酒造店, 高清水酒造場}`) and composes that with kanji-variant expansion. Used in both the first-pass `(brand AND brewery)` join and the brewery-only third pass (§4 / §15 / §14-rescue).

**Tracking.** Prompt: PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117). Defensive expansion: PR #128.

---

## 3. Variant kanji (旧字体 ↔ 新字体)

**What it is.** Many sake-brand kanji have an old form (`旧字体`) and a new form (`新字体`). The two are visually similar, share meaning, and are largely interchangeable in usage — but they're *different code points*. A model trained on modern text returns the new form; a brewery that's been around since the Meiji era prints the old form on its label and registered the old form with Sakenowa. Exact match fails.

The fix has to be per-character, not per-string: a name like `萬寿` is one old-form character (`萬`) plus one new-form (`寿`), and Sakenowa might store it as `万寿`, `萬寿`, or `万壽`. All-or-nothing replacement misses the mixed-form case.

**Example.** Operator photographs a 蔵王 bottle. Model returns `name_ja: "蔵王"` (new form). Sakenowa stores `name_kanji: "藏王"` (old form). Same brand, different code point on the leading character.

**Status.** Implemented. `src/lib/sakenowa/kanji-variants.ts` carries 17 sake-domain pairs (`藏↔蔵, 釀↔醸, 國↔国, 龍↔竜, 龜↔亀, 體↔体, 醉↔酔, 寶↔宝, 萬↔万, 鐵↔鉄, 圓↔円, 澤↔沢, 壽↔寿, 廣↔広, 學↔学, 樂↔楽, 數↔数`). `generateKanjiVariants` does per-character bitmask permutation, capped at 16 variants for sanity. The lookup SQL joins with `WHERE name_kanji = ANY($1)`.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), commit `de3d31e`. Source: `src/lib/sakenowa/kanji-variants.ts`.

---

## 4. Brewery hallucination

**What it is.** Brewery names sit in smaller type, often in stylised script, often at the bottom of the label. The model's correctness rate on brewery is meaningfully worse than on brand. A common failure mode is the model returning a *plausible-sounding kanji string that doesn't exist in Sakenowa at all*. With the current `(brand AND brewery)` exact-match join, a hallucinated brewery silently kills an otherwise-correct match.

**Example.** Operator photographs a 蔵王 bottle. Model returns `(蔵王, 宮鉄酒造)` with confidence 0.90. The variant-kanji fix from §3 handles the brand side, so the brand lookup would succeed — but `宮鉄酒造` has no equivalent in Sakenowa (the real brewery is `蔵王酒造`). The AND join misses. Real brand correctly identified, sent to no-match.

**Status.** Proposed. Two-pass lookup: try `(brand AND brewery)` first; on 0 rows, retry with `brand-only`. Three outcomes from the second pass — 1 row = `matched_brand_only` with the divergence surfaced honestly in the UI, 2+ rows = `ambiguous` (existing branch), 0 rows = `no_match`. The load-bearing part is the UX: matching brand-only without telling the visitor would silently navigate to a sake from the wrong brewery, worse than honest "we're not sure".

**Tracking.** Issue [#123](https://github.com/yawaragi-dev/yawaragi/issues/123). Probably lands alongside the three-tier confidence UX in [#109](https://github.com/yawaragi-dev/yawaragi/issues/109).

---

## 5. Rice variety mistaken for brewery

**What it is.** Sake labels prominently advertise the *rice cultivar* used: `山田錦` (Yamada Nishiki), `雄町` (Omachi), `五百万石` (Gohyakumangoku), `美山錦` (Miyama Nishiki), `出羽燦々` (Dewa Sansan), `秋田酒こまち` (Akita Sake Komachi), `愛山` (Aiyama). These are agricultural varieties, not breweries. But to a model with no domain prior, the rice-variety call-out is sometimes the second-largest piece of kanji on the label — easy to mistake for the brewery name.

**Example.** Operator photographs a 龍力 (Tatsuriki) bottle. Model returns `(竜力, "Sankei Nishiki")` with confidence 0.75. The brewery is `本田商店` (Honda Shoten). `Sankei Nishiki` is the model's romanisation of a rice-variety call-out it pattern-matched as the brewery — note also that it broke the kanji-only contract (see §6).

**Status.** Implemented. The SYSTEM_PROMPT carries an explicit "do NOT confuse the brewery with RICE-VARIETY call-outs" rule listing the seven varieties above. Backed by the Latin-only defensive guard from §6.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), commit `ae524a7`.

---

## 6. Romaji where kanji was contracted

**What it is.** The extraction schema declares `name_ja` and `brewery_ja` as kanji-script fields, and the SYSTEM_PROMPT instructs the model to return Japanese script. The model sometimes ignores this — particularly when a label prints a Latin transliteration alongside the kanji (common on export bottles), or when the kanji is hard to read and the model "defaults" to the romaji. A romanised field then routes through a kanji-keyed lookup that has no chance of matching.

The prompt rule is preventive but not contractual — there's nothing structurally stopping the model from returning Latin script. So we need a runtime guard.

**Example.** Same Sankei Nishiki case as §5 — the field came back as `"Sankei Nishiki"` rather than the kanji the prompt asked for.

**Status.** Implemented. Two-layer fix: (a) SYSTEM_PROMPT carries an "ALWAYS return Japanese script; drop confidence below 0.5 rather than substituting romaji" rule, (b) `scan-action.ts` runs a regex over hiragana (`U+3040–309F`) + katakana (`U+30A0–30FF`) + CJK ideographs (`U+4E00–9FFF`) on each field; a field with zero matches routes to `low_confidence` with a debug-overlay event identifying which field broke the contract.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), commit `ae524a7`.

---

## 7. Confidence calibration

**What it is.** The model returns a self-reported confidence score between 0 and 1. We initially set the auto-match threshold at 0.85, assuming "good photo = high confidence". Real-world mobile capture distributes much lower: across a sample of well-lit photos, confidence clustered between 0.72 and 0.75, with rare outliers at 0.42 and a thin tail at 0.85. The threshold was rejecting matches the operator considered obviously correct.

The deeper issue is that the model's self-reported confidence isn't well-calibrated against *our* notion of "matchable" — it reflects something closer to "how sure is the model that what it read is what's on the label", not "how sure is the model that this will look up". Two related-but-different things.

**Example.** A series of ~10 well-lit phone photos produced a distribution like `[0.42, 0.72, 0.72, 0.74, 0.75, 0.75, 0.75, 0.85, 0.85, 0.90]`. The single 0.42 was a legitimately tough shot worth rejecting. Everything else should have gone to lookup. A 0.85 threshold rejected 7 out of 10 correctly-extracted bottles.

**Status.** Implemented. The three-tier UX (#109 / S4 PR A) replaced the single-threshold model with `resolveConfidenceTier(confidence)` returning `'auto' | 'confirm' | 'retry'`. Thresholds: `< 0.60` → retry CTA (no lookup), `0.60 ≤ x < 0.85` → confirm card (visitor taps to accept or rescan), `≥ 0.85` → auto-navigate. The interim single-threshold tune at 0.70 was a temporary fix until the confirm tier landed; with three tiers in place, every "would-have-auto-matched" bottle in the 0.60–0.85 range now requires a confirm tap. Permanent threshold calibration still depends on the eval harness (#110).

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), commit `f6e5568`. Long-term calibration blocked by eval harness [#110](https://github.com/yawaragi-dev/yawaragi/issues/110) and finetune decision [#113](https://github.com/yawaragi-dev/yawaragi/issues/113).

---

## 8. Hand-brushed calligraphy and character-shape substitutions

**What it is.** Sake brands love calligraphy. A hand-brushed `龍` may flatten a stroke and read as `竜` (already in the variant pair from §3 — caught) but it may also read as `龕` or `籠` (not in the pair list — missed). And it's not always old/new form — sometimes it's plain visual confusion: stylised fonts collapse stroke counts in ways the variant pair list can't enumerate.

The variant-kanji approach from §3 catches the dominant `旧字体 ↔ 新字体` failure mode but is structurally exact-match underneath. A residual class of misses needs a similarity-based approach.

**Example.** 2026-06-11 live test on `Zao_Tokubetsu_mit_Box_VERY_GOOD.webp` — a 蔵王 (Zao) bottle with brushed kanji. Model returned `name_ja: '蔵玉'` at confidence 0.92 (auto tier). The misread is **one stroke**: `王` (king) vs `玉` (jewel) differ only by the bottom-right dot. The variant-kanji fix from §3 correctly tried `{蔵玉, 藏玉}` and the brewery `{蔵玉酒造, 藏玉酒造}` — but `王/玉` aren't a 旧字体↔新字体 pair, they're a visual-similarity pair with different meanings, so the expansion can't reach the real row. Confidence 0.92 because the model is confident it *read* what it sees — the misidentification is below its character-recognition resolution.

**Status.** Proposed (long-term). Pre-compute character-level / kanji n-gram embeddings for every Sakenowa brand + brewery `name_kanji`. Lookup runs exact-match (§3) first; on 0 rows runs a cosine-similarity query through pgvector and returns the top match with `kind: 'fuzzy_match'` and a similarity score. Provenance becomes `sakenowa_inferred` per ADR-0005 (deterministic math over canonical data). Threshold has to be tuned against the eval harness.

**Tracking.** Issue [#124](https://github.com/yawaragi-dev/yawaragi/issues/124). Blocked by eval harness [#110](https://github.com/yawaragi-dev/yawaragi/issues/110).

---

## 9. Word order and spacing variation

**What it is.** Some Sakenowa rows store multi-segment names with a separator — `久保田 千寿`. Labels reorder, drop, or insert different whitespace — `千寿　久保田` (reversed, full-width space), `久保田千寿` (no space), `久保田・千寿` (interpunct). Variant-kanji expansion doesn't reorder; exact match fails on every permutation.

**Example.** A Kubota Senjū bottle scanned with the model returning `久保田千寿` (no space) vs Sakenowa's `久保田 千寿` (half-width space). Single character difference, total exact-match failure.

**Status.** Proposed (long-term). Same embedding-similarity path as §8 — order- and spacing-invariant by construction.

**Tracking.** Issue [#124](https://github.com/yawaragi-dev/yawaragi/issues/124).

---

## 10. Latin-only labels (export bottles, marketing labels)

**What it is.** Some bottles — particularly those targeting export — print only the Latin transliteration on the front face, putting the kanji on the back label or omitting it entirely. The vision model correctly extracts what it sees (Latin script) but the kanji-keyed lookup has nothing to match against. The §6 defensive guard correctly routes these to `low_confidence`, but they're not really low-confidence extractions — they're a different shape of input the lookup doesn't handle.

**Example.** An export Hakkaisan bottle printed `HAKKAISAN` in large Latin caps on the front face, with `八海山` only on a small back label the operator didn't capture. Extraction returns `(HAKKAISAN, Hakkai Brewery)` — completely correct given the input — and runs straight into the Latin-only guard.

**Status.** Proposed. Once `name_romaji` is populated for every brand and brewery (already implemented via [#121](https://github.com/yawaragi-dev/yawaragi/issues/121)), the lookup can fall through to a romaji-keyed second pass. The §6 guard becomes "route to the romaji pass" rather than "route to low_confidence".

**Tracking.** Issue [#122](https://github.com/yawaragi-dev/yawaragi/issues/122). Depends on the romaji ingest from [#121](https://github.com/yawaragi-dev/yawaragi/issues/121) (merged).

---

## 11. Same-romaji collisions

**What it is.** Romaji is lossy: `Kikuhime` could be `菊姫`, `菊媛`, or `菊妃`. Different breweries, different sakes, identical romanisation. The kanji-keyed lookup avoids this by construction; the proposed romaji fallback from §10 has to handle it explicitly.

**Example.** None observed yet — this is a known constraint surfaced when designing the romaji lookup, not an in-the-wild failure. CONTEXT.md flags it as a class of error.

**Status.** Open. Resolution depends on the §10 design: same-romaji results route to `ambiguous`, the visitor disambiguates by tapping. The disambiguation UX comes for free from the three-tier confidence work in [#109](https://github.com/yawaragi-dev/yawaragi/issues/109).

**Tracking.** Issue [#122](https://github.com/yawaragi-dev/yawaragi/issues/122). Domain context in `/CONTEXT.md` under "Same-romaji collisions".

---

## 14. Single-character coherent-garbage hallucination

**What it is.** A model failure mode distinct from the "low-confidence honest unknown" case. The model returns a *single kanji* in the brand field at moderate-to-high confidence (0.65–0.80) — a character that *looks* plausible as a brand name on its own (`梗` "stem", `斗` "dipper", `炎` "flame") but is actually a fragment the model hallucinated when the calligraphy defeated it. The model thinks it read correctly; it didn't. Distinct from §6 (romaji) because the script is correct; distinct from §8 (character substitution) because the issue is missing characters, not wrong ones.

Real sake brand names are essentially never a single character. The shortest brand kanji in Sakenowa we've observed is two characters (`磯自慢`, `黒龍`, `酔鯨`, `獺祭` — all 2+). A one-character `name_ja` is therefore a near-certain hallucination signal independent of the model's self-reported confidence.

**Example.** 2026-06-11 live test on `jin_junmai_manzairaku.jpg` — bottle is **萬歳楽 (Manzairaku)** by 小堀酒造店. Model returned `name_ja: '梗', brewery_ja: '高賢樂', confidence: 0.72` — `tier 'confirm'`. The brand-only fallback correctly returned 0 (no Sakenowa brand is `梗`). Pre-fix: visitor sees "not in our catalogue" which falsely suggests the bottle isn't in the DB. Post-fix: visitor sees the retry CTA ("couldn't read clearly — try again") and the debug overlay carries a specific event explaining the route.

**Status.** Implemented in two layers (PR #128):

1. **Detection.** `src/lib/scan/scan-action.ts` runs `looksLikeSingleCharHallucination(name_ja)` after the Latin-only guard (§6) and before the Sakenowa lookup. Uses `Array.from(name_ja).length === 1` (code-point count, so a surrogate-pair kanji counts as 1, not 2). Fires a warn-level debug event identifying the single character and the model's confidence.

2. **Rescue.** When the guard fires, the action **does not immediately return `low_confidence`** — it first calls `findSakeByBreweryOnly` (the standalone third-pass seam factored out from `findSakeByExtractionFromPool`) against the extracted brewery. Motivation: across 5 attempts on the same Takashimizu image (2026-06-11 testing), the model returned 5 different single-char brand kanji (`紀, 斗, 幻, 寺田, 昇`) AT 0.72-0.75 confidence each — but the brewery `高清水酒造` was correct every time. The brand is junk, the brewery is signal. Outcomes match the standalone seam: 1 row → `matched_brewery_only` with `brandDivergence: { extracted: <the 1-char garbage>, stored: <the catalogue brand kanji> }`; 2+ rows → `ambiguous`; 0 rows → fall through to `low_confidence` as before. The visitor sees the honest "we matched the brewery but the brand on your label didn't match our catalogue" card instead of the retry CTA.

**Tracking.** Shipped in PR #128. Not its own issue — the single-character heuristic + brewery-rescue path is a defensive guard on the same calibration / hallucination surface as §6, §8, and §15.

---

## 15. Brand hallucination with correct brewery

**What it is.** The structural dual of §4 (brewery hallucination). The vision model reads the BREWERY kanji correctly but hallucinates a plausible-looking *brand* kanji — typically a real Japanese surname or word the model has high-frequency exposure to. This happens most when the brewery name is the visually-dominant kanji on the label (common for mono-brand breweries where the brand and brewery share a name), and the model invents a separate "brand" because its prior says brand and brewery are distinct fields.

The first-pass `(brand AND brewery)` join misses. The brand-only second-pass (§4 / [#123](https://github.com/yawaragi-dev/yawaragi/issues/123)) also misses — the hallucinated brand kanji isn't in Sakenowa. Both fallbacks built so far assume the brand is right and the brewery is wrong; the inverse failure shape needed its own pass.

**Example.** 2026-06-11 live test on a Takashimizu (高清水) bottle:

```
Attempt 1 (caught by §14 single-char guard):
  name_ja:    幻             ← 1-char hallucination
  brewery_ja: 高清水          ← correct brewery
  confidence: 0.75 → guard routed to retry

Attempt 2 (motivated this entry):
  name_ja:    寺田           ← 2 chars; passes the §14 guard; real
                                surname (Terada — actually a totally
                                different brewery, 寺田本家)
  brewery_ja: 高清水酒造      ← correct brewery
  confidence: 0.72
  → first-pass miss, brand-only miss, no_match
```

The brewery `高清水酒造` is the correct, well-formed Takashimizu Shuzō. The brand `寺田` is plausible (looks like a normal sake brand name) but invented. Pre-fix: `no_match`. Post-fix: brewery-only third pass finds the single Takashimizu brand line and surfaces it as `matched_brewery_only` with a brand-divergence card showing `Label: 寺田 · Catalogue: 高清水`.

**Status.** Implemented in PR #128. `findSakeByExtractionFromPool` runs a third pass when first-pass + brand-only both return 0 rows: `WHERE b.name_kanji = ANY($brewery_variants)`. Outcomes mirror the brand-only pass — 1 row → `matched_brewery_only` with `brandDivergence: { extracted, stored }`; 2+ rows → `ambiguous` (so multi-brand breweries like 旭酒造 / 八海醸造 with multiple lines route to disambiguation rather than picking arbitrarily); 0 rows → `no_match`. The UI mirrors `matched_brand_only` — explicit-tap navigation, no auto-push, side-by-side display of `Label: X · Catalogue: Y`. The matched brand also lands in the per-tab consensus history so subsequent retry-mode scans can vote on it.

**Tracking.** Shipped in PR #128. Conceptually a follow-up to [#123](https://github.com/yawaragi-dev/yawaragi/issues/123) — same divergence-surfacing pattern, opposite field.

---

## 16. Single-shot variance (and multi-shot consensus)

**What it is.** The vision model's output is not deterministic across multiple scans of the same image. Confidence stays roughly constant (0.72–0.85 on well-lit mobile photos) but the extracted brand kanji *changes between attempts*. This is distinct from §7 (the model is miscalibrated) — calibration is about the relationship between confidence and correctness; variance is about the relationship between attempts.

When the model's per-attempt accuracy on a given bottle is, say, 60%, individual scans are unreliable but **the visitor scans the same bottle multiple times during a session**. A consensus mechanism over recent successful scans converts noisy individual reads into a reliable signal — the failure modes are uncorrelated across attempts, the correct answer accumulates votes, hallucinations spread thinly.

**Example.** 2026-06-11 Takashimizu trace, five attempts on the same `23940.jpg`:

```
Attempt 1: name_ja: 紀   brewery_ja: 高清水酒造  conf: 0.75
Attempt 2: name_ja: 斗   brewery_ja: 高清水     conf: 0.75
Attempt 3: name_ja: 幻   brewery_ja: 高清水     conf: 0.75
Attempt 4: name_ja: 寺田  brewery_ja: 高清水酒造  conf: 0.72
Attempt 5: name_ja: 昇   brewery_ja: 高清水     conf: 0.75
```

Five different brand kanji, five times the same brewery, confidence pinned in a narrow band. Per-attempt the brand is a hallucination; across attempts the brewery converges. The defensive guards from §6 / §14 catch individual shots; the consensus from this entry catches the *next* attempt by leaning on what previous successful scans agreed on.

**Status.** Implemented in PR #128. `src/lib/scan/scan-history.ts` writes every successful match (`matched`, `matched_brand_only`, `matched_brewery_only`) into a per-tab `sessionStorage` array, capped at 10 entries. `getConsensusFromHistory()` returns the brand if more than half of the recent entries resolved to the same `brandId` — a strict-majority rule, never a plurality. `useScanHistoryConsensus()` is a `useSyncExternalStore` hook the form subscribes to. When the visitor's latest scan lands in `low_confidence` AND a consensus exists, the UI surfaces a card: *"Based on your recent scans, this looks like X · 3 of your last 5 scans agreed"* with explicit Yes / Rescan. Stored kanji prefers the *catalogue* value over the latest extraction for matched_brewery_only (the model's extracted brand was junk), so the consensus card displays the canonical brand kanji.

**Privacy.** sessionStorage is per-tab, ephemeral (cleared when the tab closes), and never crosses an origin. No new GDPR processing operation — pure UI state about brand IDs the visitor already saw within this tab. Lawful basis Art. 6(1)(f) legitimate interest in UX continuity within a single tab session. No consent banner involvement.

**Tracking.** Shipped in PR #128. The eval harness ([#110](https://github.com/yawaragi-dev/yawaragi/issues/110)) is what will tell us whether the strict-majority threshold is right — a future tuning could use a weighted vote (auto > confirm > matched_brand_only > matched_brewery_only) or a confidence-weighted vote, but those depend on having ground truth.

---

## 17. Field-swap: brand kanji in the brewery field

**What it is.** Bottles where the brand is the visually dominant kanji and the brewery is small / in a corner / not what catches the eye. The model "sees" the prominent kanji, reads it correctly, but assigns it to the WRONG field — `brewery_ja` instead of `name_ja`. The `name_ja` field then ends up with whatever the model hallucinates to fill the gap, often a single-character junk (caught by §14).

The structural issue is that the model's prior assumes brand and brewery are *distinct* labels on the bottle. When they're not (mono-brand breweries where one name dominates), the model invents a separate brand to satisfy its schema rather than putting the same name in both fields.

**Example.** 2026-06-11 Takashimizu testing on `23940.jpg`. The bottle's prominent kanji is `高清水` (the brand, Takashimizu). The actual brewery is `秋田酒類製造` (Akita Shurui Seizo) — printed small at the corner of the label. Multiple attempts:

```
name_ja: 北   brewery_ja: 高清水酒造  ← model puts brand+酒造 in brewery field
name_ja: 貴   brewery_ja: 高清水      ← brand alone in brewery field
name_ja: 斗   brewery_ja: 高清水      ← same; name_ja is hallucinated single char
```

The §14 single-char guard fires on `name_ja` (correct — it's junk). The §15 brewery-only rescue tries `高清水` as a brewery — but Sakenowa has `高清水` as a *brand*, not a brewery, so 0 rows. Without a field-swap fallback the visitor sees the retry CTA on a bottle that's actually fully identifiable.

**Status.** Implemented in PR #128. After the §14 single-char guard's brewery-only rescue misses, the action calls `findSakeByBrandOnly` with `nameJa = extraction.brewery_ja` — treating the brewery field AS the brand. If exactly one brand matches, returns `matched_brand_only` carrying the canonical brand kanji on a new `sakeKanji` field plus a brewery divergence `{ extracted: <what label labelled "brewery">, stored: <real brewery from Sakenowa> }`. The UI's matched_brand_only branch now reads `state.sakeKanji` for the prominent kanji display instead of `state.extraction.name_ja`, so the field-swap rescue surfaces the correct brand kanji (not the model's single-char hallucination).

**Sakenowa data dependency.** This rescue path only fires when Sakenowa actually has the brand under some brewery. If a major-brand brewery is missing from Sakenowa entirely (Takashimizu may be one such gap based on the live preview testing), no code-level rescue helps and the visitor still sees `low_confidence`. The eval harness ([#110](https://github.com/yawaragi-dev/yawaragi/issues/110)) is the right place to catalogue which expected brands are absent from the ingested mirror.

**Tracking.** Shipped in PR #128. New standalone seam `findSakeByBrandOnly` extracted from the inline second pass of `findSakeByExtractionFromPool` to make the field-swap callsite cleanly reusable.

---

## Capture-layer obstacles

Upstream of recognition but shape its failure modes.

### 12. No image stabilisation in default camera mode

**What it is.** The current scan flow uses HTML5 `<input capture="environment">`, which hands off to the OS camera app for a single shot. There's no in-browser preview, no stabilisation indicator, no "hold steady" feedback. Mobile-Safari and mobile-Chrome both fire the shutter the moment the user taps — including the small hand-jitter from the tap itself. Motion blur shows up disproportionately in low light.

**Example.** Operator notes that confidence is consistently lower indoors than the lighting alone would suggest. Comparing capture-time EXIF: indoor shots run 3–10× the shutter time of outdoor, and the proportional motion blur eats into the model's ability to read calligraphy at the edges.

**Status.** Open. Not blocking — `<input capture>` is the right primitive for first-launch (zero permission prompts, works across iOS / Android / desktop). A future iteration could move to `getUserMedia` + a custom capture UI with a level/steadiness indicator and a software shutter delay, but that adds permission-prompt friction and a meaningful UI surface.

**Tracking.** Issue [#125](https://github.com/yawaragi-dev/yawaragi/issues/125).

### 13. Operator framing variance

**What it is.** Different operators frame the bottle differently — some fill the frame with the label, some leave the bottle small in the centre, some shoot at an angle so the label is keystoned. Frame-fill correlates strongly with model confidence; angled labels add geometric distortion the model has to fight through.

**Example.** Side-by-side comparison from the same operator on the same bottle in the same lighting: framed label = 0.85 confidence, bottle-in-context = 0.72.

**Status.** Open. Same trade-off as §12 — solvable with a custom capture UI showing a target frame outline, at the cost of permission friction.

**Tracking.** Issue [#126](https://github.com/yawaragi-dev/yawaragi/issues/126) (likely paired with [#125](https://github.com/yawaragi-dev/yawaragi/issues/125) if pursued).

---

## Cross-references

- PRD [#105](https://github.com/yawaragi-dev/yawaragi/issues/105) — Phase 3 anonymous label scan, the umbrella for all of the above.
- ADR [docs/adr/0005-source-provenance.md](./adr/0005-source-provenance.md) — provenance taxonomy used for `llm_extracted`, `sakenowa_inferred`, and `cross_beverage_map` distinctions.
- ADR [docs/adr/0013-feature-debuggability-requirement.md](./adr/0013-feature-debuggability-requirement.md) — the debug-overlay rule that lets us diagnose any of the above from a phone in the wild.
- `/CONTEXT.md` — domain glossary, including the same-romaji-collision note (§11).
- Eval harness [#110](https://github.com/yawaragi-dev/yawaragi/issues/110) — the ground-truth dataset every "tune this against real data" claim above depends on.

---

## How to use this doc

When a scan fails in the wild and the debug overlay shows you the trace, walk this list top-to-bottom and ask "is this what I'm seeing?". The first match is usually the obstacle in play. File new entries here as new failure shapes show up; the goal is for every distinct shape to have a name in this catalogue so we can talk about them precisely.

When a new entry's status moves from "proposed" or "open" to "implemented", update the **Status** line and add the PR / commit reference to the **Tracking** line. Don't delete entries — the historical context (what the obstacle looked like before the fix) is the part the blog series wants.
