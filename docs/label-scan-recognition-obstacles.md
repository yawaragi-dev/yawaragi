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

**Status.** Implemented in PR #128 across three iterations:

1. **Initial rescue path.** After the §14 single-char guard's brewery-only rescue misses, the action calls `findSakeByBrandOnly` with `nameJa = extraction.brewery_ja` — treating the brewery field AS the brand. If exactly one brand matches, returns `matched_brand_only` carrying the canonical brand kanji on a new `sakeKanji` field plus a brewery divergence `{ extracted: <what label labelled "brewery">, stored: <real brewery from Sakenowa> }`. The UI's matched_brand_only branch reads `state.sakeKanji` for the prominent kanji display instead of `state.extraction.name_ja`.

2. **Suffix-stripping refinement.** First live test on the Takashimizu bottle still missed because the model returned `brewery_ja: '高清水酒造'` (brand + operational suffix), and `findSakeByBrandOnly` queried verbatim — Sakenowa stores the brand as `高清水` (no suffix). `expandPossibleBrandVariants` was added in `brewery-variants.ts` as the dual of `expandBreweryVariants`: when the input ends with an operational suffix (`酒造`, `醸造`, `酒造店`, `酒造場`), it adds the stem as a lookup candidate. Field-swap now finds `高清水` even when the model adds the suffix.

3. **Generalised to the full-extraction path.** Until 2026-06-12 the field-swap rescue only fired inside the single-char guard (`name_ja.length === 1`). Two new traces motivated the generalisation:
   - **22175.jpg** `(name_ja: '崇麗', brewery_ja: '杉玉酒造')` — brand `崇麗` is 2 chars (passes single-char guard), but is actually junk. The real brand is `杉玉` (Sakenowa Brand 14, by `桃川` Brewery 12); the model put it in `brewery_ja` with the `酒造` suffix attached.
   - **22176.jpg** `(name_ja: '山田錦', brewery_ja: '白鹿')` — brand field has a *rice variety* (§5 in inverted direction), brewery field has the real brand `白鹿` (Sakenowa has it from two different breweries).

   `findSakeByExtractionFromPool` now runs a **4th pass** after the first three miss: `findSakeByBrandOnly({ nameJa: query.breweryJa, … })`. If exactly one row → `matched_brand_only` with field-swap divergence. If 2+ → `ambiguous` (Hakushika case lands here — multiple breweries share the brand). Echoes the original query back so the divergence card shows the visitor's actual brewery_ja, not the swapped value. Same logic as the single-char rescue, but available to any extraction shape.

**Verified Sakenowa data.** A 2026-06-12 freshness check confirmed `高清水` (Brand 81, breweryId 56) and `秋田酒類製造` (Brewery 56) are both in our mirror. This obstacle is fully code-rescued in the common case. The earlier hypothesis that Takashimizu was absent from Sakenowa was wrong — the gap was the missing suffix-strip in the brand-only path.

**Tracking.** Shipped in PR #128. New standalone seam `findSakeByBrandOnly` extracted from the inline second pass of `findSakeByExtractionFromPool` for clean reuse from the field-swap callsite. `pnpm sakenowa:freshness` is the operational tool for confirming a recurring failure is a code gap, not a mirror gap.

---

## 18. Sub-brand / SKU name on label, main brand in catalogue

**What it is.** Some sake families have multiple named product lines under a single Sakenowa brand. The bottle's prominent kanji is the *line name* (a unique product), but Sakenowa only stores the *main brand* — the line isn't its own catalogue entry. The model reads what's prominent (correct from the model's point of view), the lookup queries that, and nothing matches because the kanji the visitor sees on the bottle isn't a Sakenowa key.

Distinct from §1 (grade descriptors like `純米大吟醸 磨き45`, which we strip via prompt rules). A grade descriptor is a documented stripable token. A *unique line name* like `七垂二十貫` is the brand name from the visitor's point of view — there's no rule that says "strip this" because every brewery's line names are different and we'd be enumerating an unbounded list.

**Example.** 2026-06-12 live test on `22181.jpg`. The bottle is **楯野川** (Tatenokawa) by **楯の川酒造** — a Yamagata brewery (areaId 6) — and the specific product line on the label is **七垂二十貫** (Nanatare Nijukkan), an ultra-premium polishing-rate sake. Sakenowa stores brand `楯野川` (id 120, breweryId 83); it does NOT store `七垂二十貫` as a separate brand.

Model returned `name_ja: '七垂二十', brewery_ja: '沢農家', confidence: 0.75`. Two failures stacked:

1. **Brand**: model read the prominent line name `七垂二十貫` but dropped the final `貫`. Even with the full kanji, the lookup would still miss — `七垂二十貫` isn't in Sakenowa under any spelling.
2. **Brewery**: `沢農家` ("swamp farmhouse") is a hallucination — the real brewery `楯の川酒造` is small / in a corner of the label. The single-char guard doesn't fire (3 chars), brewery-only fallback misses (no such brewery in Sakenowa).

Net: `no_match`. Pre-fix, post-fix, all-fix — same outcome. The lookup chain has nothing to anchor on.

**Status.** Open. No code-level rescue available. Three potential approaches, ranked by effort:

- **Sub-brand → main-brand mapping table.** Hand-curated rows: `{ '七垂二十貫': '楯野川', '磨き二割三分': '獺祭', … }`. Catches the dominant famous sake lines. Sub-brand of §11's `manual_curation` provenance. High maintenance, narrow coverage, but the cases it catches are exactly the cases the visitor most expects to work.
- **Embedding similarity (§8 / [#124](https://github.com/yawaragi-dev/yawaragi/issues/124)) won't help here.** `七垂二十貫` has near-zero character-level similarity to `楯野川` — they share no kanji. Embedding similarity catches *one-character* misreads; whole-brand mismatches need a different mechanism.
- **Eval-harness coverage ([#110](https://github.com/yawaragi-dev/yawaragi/issues/110))** so we measure how often this happens in the wild before investing in a fix. The mapping table is the obvious next step *if* the eval shows famous sub-brand lines are a meaningful chunk of failures.

**Verification tooling.** The `pnpm sakenowa:freshness` canary now includes 楯野川 + 楯の川酒造 so a future regression where the *main brand* drops from the mirror is caught immediately. The sub-brand mismatch itself is structural and won't show up in a freshness check.

**Tracking.** Documented here; not fileable as a single-PR issue. Resolution depends on either (a) the eval harness motivating a sub-brand mapping or (b) Sakenowa publishing line-level data we can mirror.

---

## 19. Brand truncation where the truncated form doubles as a style marker

**What it is.** A cousin of §18, with an added trap. The model reads a multi-part brand name (`<prefix> + <suffix>`) and returns only the suffix. Unlike §18 where the truncated piece is a unique product line, here the suffix is *also* a recognised style marker (cask type, brewing method, presentation form). Stripping it via prompt rules — the obvious instinct — would break the cases where the suffix is genuinely part of the brand.

**Example.** 2026-06-12 live test on `22180.jpg`. Model returned `name_ja: '樽酒', brewery_ja: '宮野酒造', confidence: 0.85`.

`樽酒` ("tarusake") simultaneously names:
- A real Sakenowa brand `吉野杉の樽酒` (id 2120, by `長龍酒造` id 594, Nara) — Yoshino-cedar cask aged sake from Nara. Famous bottle.
- A real Sakenowa brand `樽平` (id 142, by `樽平酒造` id 94, Yamagata) — though the model would have returned `樽平` for that, not `樽酒`.
- A common style marker tacked onto unrelated brands — `富久長 樽酒`, `賀茂泉 樽酒`, etc. — where the brand is the *first* word and `樽酒` is a cask-aging modifier.

The brewery `宮野酒造` is hallucinated (not in Sakenowa). Without the correct brewery anchor, the lookup chain has nothing to work with.

**Why we can't fix this via prompt stripping.** Adding `樽酒` to the style-modifier strip list (§1) would correctly handle `富久長 樽酒` → strip to `富久長`. But it would WRONGLY strip `吉野杉の樽酒` → `吉野杉の` (a fragment that isn't a brand) or `空` (empty if it's the whole brand). The disambiguation requires knowing which case is which, which the model can't do without per-brand prior knowledge.

**Distinct from §1.** §1 lists grade descriptors (`純米大吟醸`, `磨き45`) that are *unambiguous* stripable tokens — they never form part of a brand. Style markers like `樽酒`, `古酒`, `にごり` straddle that line — sometimes they ARE part of the brand. The current §1 strip list (`無濾過 / 生酒 / ひやおろし / 古酒 / 貴醸酒 / スパークリング / にごり / 原酒`) was chosen to be unambiguous; `樽酒` doesn't pass that bar.

**Status.** Open. Same approach options as §18, refined for this class:

- **Per-brand mapping** would catch this if `吉野杉の樽酒` is in the table. Higher value than §18 because the ambiguity makes prompt-tightening risky — the table is the only safe fix.
- **Embedding similarity (§8 / [#124](https://github.com/yawaragi-dev/yawaragi/issues/124)) might help here** unlike §18: `樽酒` IS a substring of `吉野杉の樽酒`, so a substring-bigram or trailing-n-gram match could surface the candidate. Not just character-level cosine, but trailing-edit-distance over the brand corpus could promote `吉野杉の樽酒` as the top candidate. Worth weighing when #124 design lands.
- **Honest UX retreat:** even when we *might* know the brand, we can't be confident enough to navigate. The current `no_match` outcome is technically correct — the visitor's input is genuinely ambiguous.

**Tracking.** Documented here. Eval harness ([#110](https://github.com/yawaragi-dev/yawaragi/issues/110)) is the right place to quantify how often this shape comes up. Add `吉野杉の樽酒` to the canary set once we believe this brand is in production demand.

---

## 20. Mono-brand brewery: brand and brewery share a name

**What it is.** Many breweries have a single main brand whose kanji matches the brewery's own name. `沢の鶴` (brand) by `沢の鶴` (brewery). `大七` by `大七酒造`. `賀茂泉` by `賀茂泉酒造`. The vision model has a strong prior that "brand" and "brewery" are distinct labels, so when both fields would have the same kanji on the bottle, the model picks one and *invents* the other — almost always inventing the brand. The brewery field gets the correct kanji; the brand field gets a hallucination.

This is a focused subclass of §15 (brand hallucination with correct brewery). The fix is also more focused — when the brewery matches and has multiple candidate brands, *one of which has the same kanji as the brewery*, that's almost certainly the main line the visitor scanned.

**Example.** 2026-06-12 trace on a `沢の鶴 純米酒 山田錦` bottle from Nada (Hyogo). Model returned:

```
name_ja:    八仙     ← invented; not on the label at all
brewery_ja: 沢の鶴   ← correct, the brewery + main brand share this kanji
confidence: 0.92
```

Sakenowa Brewery 576 (`沢の鶴`) has multiple brands: Brand 775 (`鶴の舞`), Brand 776 (`酒道粋人`), Brand 2008 (`沢の鶴`), and others. Pre-fix the brewery-only pass returned `ambiguous` with candidates 775 + 776 — Brand 2008 (the actually-correct main line) was *off the end of the `LIMIT 2`* because the SQL ordered by `brand_id`. The visitor would have seen an ambiguous list of sub-lines that didn't include their bottle.

**Status.** Implemented in PR #128. Two changes to `SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_KANJI`:

1. **`ORDER BY (CASE WHEN br.name_kanji = b.name_kanji THEN 0 ELSE 1 END), br.brand_id`** — promotes the same-name brand row to the top so it can't be `LIMIT`-truncated off the end.
2. **`LIMIT 5`** (from 2) — gives `findSakeByBreweryOnlyFromPool` enough headroom to detect "multiple same-name candidates across different breweries" without being unbounded.

`findSakeByBreweryOnlyFromPool` then promotes the same-name row to `matched_brewery_only` when EXACTLY ONE brand under the matched brewery has the same kanji as the brewery. If 2+ same-name candidates exist (rare: two different breweries with the same kanji each having a main brand) it falls through to `ambiguous` so the visitor disambiguates which brewery.

Post-fix the Sawanotsuru bottle flips from `ambiguous` (with wrong candidates) to `matched_brewery_only` carrying `沢の鶴` (Brand 2008) with a brand-divergence card "Label: 八仙 · Catalogue: 沢の鶴".

**Tracking.** Shipped in PR #128. Same-name preference is conservative — only fires when there's exactly one same-name candidate, otherwise the existing ambiguous behaviour kicks in.

---

## 21. Total model surrender / same-string hallucination

**What it is.** The model emits an identical plausible-looking kanji string in BOTH `name_ja` and `brewery_ja` with moderate-to-high confidence. This isn't a misread of the bottle — the model didn't read the label at all. It produced a confident-sounding guess where both fields happen to be byte-identical.

Distinct from every other class catalogued here. §5, §15, §17, §19, §20 all have at least one field with useful signal — a rice variety, a real brand the model put in the wrong place, a sub-line of the right brand. Here both fields are fabrications with no relation to the label.

**Example.** 2026-06-12 trace on `PXL_..._084646226.jpg`. Actual bottle: `谷川岳 超辛純米` by `永井酒造` (Brand 273, Brewery 191, Gunma — Tanigawadake by Nagai Shuzo). Model returned `name_ja: '玄白', brewery_ja: '玄白', confidence: 0.65`. The kanji `玄白` doesn't appear anywhere on the label. Confidence 0.65 still lands in the `confirm` tier (≥0.60), so the system attempted lookup. All four passes correctly missed.

**Status.** Open — but with a small optimisation shipped in PR #128. When `name_ja === brewery_ja`, the 4th-pass field-swap (brand-only on `brewery_ja`) would be byte-identical to the step-2 brand-only call that already returned 0 rows. The lookup now short-circuits the redundant query in this case. Saves one DB round-trip and produces a clearer debug trace.

The core failure shape itself has no code rescue. When both fields are simultaneously wrong AND identical, no fallback chain can reach the truth. The honest outcome is `no_match` → retry CTA, which is what the visitor sees today.

**What might help long-term:**
- **§16 consensus.** If the visitor scans the same bottle multiple times and even one attempt returns something close to the right brand+brewery, the history mechanism would surface it. Single-shot is unrecoverable.
- **Eval harness ([#110](https://github.com/yawaragi-dev/yawaragi/issues/110)).** Quantify how often the model surrenders into this same-string shape. May correlate with photo quality, lighting, unfamiliar fonts, or specific calligraphy styles. The relative frequency is what would justify the failover decision in [#113](https://github.com/yawaragi-dev/yawaragi/issues/113).
- **Better vision model.** Out-of-scope for this catalogue but the structural answer.

**Tracking.** Documented here. Redundant-pass short-circuit shipped in PR #128 alongside this entry.

---

## 22. Script-coverage gaps — kana and Latin brand names

**What it is.** Until 2026-06-12 the lookup chain joined exclusively on `name_kanji` with only 旧字体 ↔ 新字体 kanji-variant expansion. A direct audit of the Sakenowa upstream payload shows the catalogue is meaningfully broader than "kanji":

| Script profile | Brands | Examples |
|---|---|---|
| Pure kanji        | 2 200 (69.5 %) | `獺祭`, `八海山`, `久保田` |
| Mixed kanji + kana | 653 (20.6 %)   | `風のささやき`, `北の誉`, `えぞ乃熊` |
| Pure hiragana     | 169 (5.3 %)    | `ゆめほなみ`, `あたごのまつ`, `まほろば` |
| Pure Latin        | 110 (3.5 %)    | `Shangri-la`, `I LOVE SUSHI`, `Highland` |
| Pure katakana     | 35 (1.1 %)     | `ラッキーキャッツ`, `タクシードライバー` |

**~10 % of Sakenowa brands are stored in non-kanji scripts**, plus another 20 % include kana characters mixed with kanji. The old `name_kanji = ANY([kanji-variants])` lookup couldn't reach any of them when the model returned a script-cross form.

**Example.** 2026-06-12 trace on a `UMAMI` collaboration bottle by 川鶴酒造 × 柴田屋酒店. The label shows the brand in katakana (`うまみ`) plus Latin (`UMAMI`). Model returned `name_ja: '梅実'` — a wrong-kanji transliteration of what's actually kana on the label. Even before considering the catalogue gap (UMAMI is a collaboration product not in Sakenowa), the lookup couldn't even *try* the kana form because the variant expansion was kanji-only.

**Status.** Implemented (kana-cross only) in PR #128. New `kana-variants.ts` adds `expandKanaVariants(text)` which adds hiragana ↔ katakana siblings via the deterministic Unicode-offset 0x60 mapping (per-character, so mixed kanji+kana strings get the kana portion flipped while the kanji portion stays). Wired into both `expandBrandVariants` (used by first-pass and standalone brand-only) and `expandBreweryVariants` (used by third-pass brewery-only), via composition with the existing kanji-variant pass. Tests cover empty / pure kanji / hiragana → katakana / katakana → hiragana / mixed-script / long-vowel-mark (ー) edge case.

What this fix DOES catch:
- Model returns `うまみ`, Sakenowa stores `ウマミ` → matches via katakana variant.
- Model returns `ラッキー`, Sakenowa stores `らっきー` → matches via hiragana variant.
- Mixed-script `風のささやき` ↔ `風ノササヤキ`.

What this fix does NOT catch:
- **Catalogue gap for collaboration / limited / special-edition products.** Sakenowa's brand model is main-line only. The UMAMI case fails for this reason regardless of script bridging.

**2026-06-12 follow-up (same PR #128): Latin support + prompt script-preservation.**

Two more layers landed after a second UMAMI bottle trace where the model kept hallucinating wrong kanji (`梅実`, then `梅美` on a re-scan) from the katakana on the label:

1. **Prompt script-preservation rule.** `anthropic-haiku-provider.ts` SYSTEM_PROMPT rule 1 rewritten from "always return Japanese script" to "preserve whatever script the brand is actually printed in" — kanji stays kanji, katakana stays katakana, hiragana stays hiragana, Latin stays Latin. With four worked examples per script and an explicit "do NOT convert katakana to kanji" instruction. The retailer-vs-brewery confusion (also visible on the UMAMI bottle: model picked the retailer 柴田屋酒店 over the actual brewery 川鶴酒造) gets its own new rule 4 — "do NOT confuse the brewery with a RETAILER (酒店 / 酒販店 / リカーショップ)".

2. **Latin brand-name lookup.** A 5th pass in `findSakeByExtractionFromPool`: `WHERE LOWER(brands.name) = LOWER($1)` against the Sakenowa-published `name` column. Only fires when the four kanji+kana passes have all missed AND `name_ja` is Latin-shaped (`[A-Za-z]` present, no Japanese script). Case-insensitive so `UMAMI` / `umami` / `Umami` all match the same catalogue row. Outcome shape mirrors brand-only: 1 row → `matched_brand_only`, 2+ → `ambiguous`, 0 → `no_match`. The `scan-action.ts` Latin-only guard is relaxed to only apply when `brewery_ja` is Latin (brand-field Latin now flows through).

After these layers, the bottle classes catalogued in §22 reach Sakenowa for the first time:
- Pure Latin brands (110): direct match via the 5th pass.
- Pure kana brands (204): kana cross-match in passes 1-4.
- Mixed-script brands (653): kana cross applies to the kana portion.

What still doesn't help:
- **Wrong-kanji hallucination from kana** (the UMAMI / 梅実 trace itself). The prompt update targets exactly this — if the model follows the new rule and returns `うまみ` instead of `梅実`, the kana cross-match would resolve UMAMI bottles whose brand actually exists in Sakenowa. UMAMI specifically still fails for catalogue reasons (below).
- **Catalogue gap for collaboration / limited / special-edition products.** Sakenowa's brand model is main-line only. UMAMI is a Kawatsuru × Shibataya collaboration product — not in Sakenowa under any spelling. No code-side fix bridges this.

**Tracking.** Kana-cross + Latin pass + prompt script-preservation + retailer-not-brewery rule all shipped in PR #128.

**2026-06-13 correction on the "catalogue gap" framing.** Earlier passes of this entry attributed the UMAMI failure to "Sakenowa's brand model is main-line only — collaboration products aren't tracked." A direct check of Sakenowa's live site that day disproved this: UMAMI exists at `https://sakenowa.com/en/brand/4RhvfkA`. The real diagnosis is that **`muro.sakenowa.com/sakenowa-data/api/brands` (which we ingest) has not been re-generated since 2024-03-21** — every brand added by Sakenowa since then is invisible to our mirror, regardless of whether it's a collaboration, a limited edition, or just a brand registered after the freeze. Mitigation (manual-curation extension layer + α-policy refresh conflict handling) is captured in **ADR-0014** and migration `0011_manual_curation_layer.sql`. UMAMI is the case-zero hand-added row.

**2026-07-08 update — the "not re-generated since 2024-03-21" reading is superseded (ADR-0016, #201).** A re-check of the same endpoint found it *is* being regenerated: the mirror now reaches `max(brand_id)=121331` (the live upstream frontier; a 2024 freeze caps near ~79k) and `pnpm sakenowa:freshness` reports it up to date. The 2026-06-13 observation was a one-time stale pull / CDN cache, not a frozen dump. The real, remaining gap is **flavor-chart coverage** (Sakenowa's 6-axis profile exists for only ~1,500 of ~3,253 brands), not base catalogue staleness — see **ADR-0016**. The manual-curation layer still stands, repurposed for the curated EU/US import delta.

---

## 23. Stylized-label failure: model fabricates a confidently-shaped mono-brand name

**What it is.** The front label of the bottle is designer-driven and the model can't read it — the kanji is brushed, decorative, broken across multiple lines, or composited with non-kanji graphics. Rather than dropping confidence, the model **emits the mono-brand pattern (`X / X酒造`) with a confidently-named `X` that has zero relation to the bottle.** High confidence (often 0.85+), looks structurally valid, fabricated end-to-end.

Distinct from:
- §8 (character-shape substitution): swaps one character of a real brand for a visually-similar one. Embedding similarity (#124) would catch it.
- §21 (model surrender → same string in both fields): model emits an identical hallucinated string in both fields. No code rescue possible.
- This (§23): model emits the §20-shaped mono-brand pattern but the kanji has no relation to the bottle. The first three passes plus field-swap all miss because `X` doesn't exist in Sakenowa at all. No catalogue gap to blame — the brand and brewery DO exist under their real names; the model just gave up.

**Examples.** Both from 2026-06-12 testing:

- `17812830102893231674443333275496.jpg` — actual bottle is `二世古 純米大吟醸` by `二世古酒造` (Brand 1611, Brewery 923, Hokkaido — both in Sakenowa). Front label stylized to the point of being unreadable. Model returned `name_ja: '熱海', brewery_ja: '熱海酒造', confidence: 0.92`. Zero overlap with the real kanji (二世古 is 3 chars; 熱海 is 2 chars; no shared characters). Total fabrication.

- `1781283053034529917091330569505.jpg` — likely `鍋島 (Nabeshima)` by `富久千代酒造` (Brand 975, Brewery 758, Saga — both in Sakenowa). Famous premium brand. Model returned `name_ja: '鹿島', brewery_ja: '鹿島酒造', confidence: 0.85`. This could be §8 (鍋 ↔ 鹿) OR §23 — without comparing labels side by side, ambiguous. If `鍋 → 鹿` is a real character substitution the model committed, §8 (and #124 would catch). If it's confident fabrication, §23.

**Status.** Documented, no per-failure rescue possible. Two complementary mitigations shipped in PR #128:

1. **`backLabelHint` UI string.** When the visitor lands on `low_confidence` (retry) OR `no_match`, the panel now includes a hint: *"Tip: if the front label is stylized, try the back — the brewery name and kanji are usually clearer there."* Real-world bottles like 二世古 ship readable regulatory information on the back label even when the front is undecipherable. Two i18n strings (EN + DE), rendered between the existing copy and the rescan button.

2. **Conscious choice NOT to add fuzzy code rescue.** Adding character-level Levenshtein or any "find a brand within edit distance K" pass would have catastrophic false-positive rates on §23. The fabricated name `熱海` is 2-char away from `鳴海`, `愛海`, `滄海`, `熱錢`, etc — none of which are the visitor's bottle. Confidently navigating to a wrong sake based on a fabricated extraction is worse than `no_match` with a useful hint.

**What would actually help long-term:**
- **#110 eval harness** to measure §23's frequency. Could be 5 % of failures, could be 30 %; the answer informs whether to invest in stylized-label-specific tooling.
- **Multi-shot capture** — the front-or-back decision could be visitor-driven (two photos) and the system could combine. Out of scope; a Phase 4 idea.
- **#124 embedding similarity** does NOT help §23 — embeddings can't bridge "the model gave up" gap. Only catches §8 (real substitution).
- **Better vision model.** Now realised as §24 (tier-2 Sonnet retry).

**Tracking.** Documented here. UI hint shipped in PR #128. Per-failure rescue arrived via §24 (tier-2 retry on Sonnet 4.6).

---

## 24. Calligraphic / brush-style kanji misread by Haiku — tier-2 vision retry

**What it is.** Haiku 4.5 vision is materially worse than Sonnet 4.6 at reading brush-style or calligraphic kanji, especially when set against a busy or low-contrast background. On clear bottles (clean sans-serif kanji, UMAMI-style Latin) Haiku is fine; on hard ones it produces high-confidence hallucinations — kanji that vaguely match the shape or sound of the actual brand. The model's *self-reported* confidence stays at the auto-tier threshold (0.85+), so the only signal that something went wrong is the downstream Sakenowa lookup miss.

**Examples.** All 2026-06-14 testing on a single Tanigawa-dake bottle:

- Actual brand: `谷川岳` by `永井酒造` (Brand 273, Brewery 191, Gunma — both in Sakenowa). Latin "TANIGAWA DAKE / CHOKARA JUNMAI" visible on the side label.
- Haiku attempts on the same image:
  - `name_ja: "不明", brewery_ja: "不明"` (placeholder give-up — fixed by §rule 5 in the system prompt + `isPlaceholderExtraction` server guard)
  - `name_ja: "天川", brewery_ja: "天川酒造"` (hallucinated kanji that vaguely sounds like "tanigawa")
  - `name_ja: "天向", brewery_ja: "天向酒造"` (different hallucination, same shape)
  - `name_ja: "天向", brewery_ja: "佐藤酒造"` (yet another hallucination, brewery pulled from a generic prior)

The instability itself is the signal: Haiku has no reliable visual anchor on this image and is sampling from its kanji prior each call. Prompt hardening (anti-`不明` rule, "preserve script" rule, "DO NOT translate Latin to kanji" rule with a Tanigawa example) did not change the behaviour — Haiku's vision capability is simply insufficient.

**Status.** Solved via a two-tier vision strategy in `scanAction` (`src/lib/scan/scan-action.ts`):

1. **Tier 1 = Haiku 4.5** runs every scan. Cheap (~$0.001/scan), fast (1–2 s). Handles the happy path.
2. **Tier 2 = Sonnet 4.6** runs only when tier-1 produced a failure signal:
   - `no_match` (Sakenowa lookup chain found nothing on what Haiku extracted)
   - `low_confidence` (Haiku itself dropped confidence below the retry threshold, or an early guard caught a sentinel / Latin-only brewery / single-char hallucination)
   - `extraction_failed` (Haiku threw — `AI_NoObjectGeneratedError` etc.)
   - `matched_brand_only` / `matched_brewery_only` (Sakenowa resolved a partial match WITH a brewery / brand divergence — strong signal Haiku misread at least one field; see §25 for the canonical case)
   - `ambiguous` (Sakenowa returned multiple candidates — the most common cause is a field-swap or under-specified extraction by Haiku, e.g. Kiku-Masamune taru-sake 2026-06-14 where Haiku field-swapped descriptor / brand and the brewery-only fallback found 4 real 菊正宗 candidates; Sonnet reads cleanly and lands on a first-pass exact match. Genuine catalogue-side ambiguity — `Kubota` with multiple sub-lines — also pays the retry cost without UX gain, but the field-swap case is more common for the DACH-focused launch corpus.)
3. **`matched` (first-pass exact)** is the only tier-1 result returned as-is — Sakenowa already resolved unambiguously and Sonnet would only re-read the same extraction at higher cost.

Verified on the Tanigawa-dake bottle: Haiku returned `天向 / 天向酒造` → all 5 Sakenowa passes missed → `no_match` → tier-2 retry → Sonnet returned `谷川岳 / 永井酒造` at confidence 0.88 → first-pass matched brand 273 in 100 ms. End-to-end ~5.4 s (vs. forever on Haiku alone).

**Cost shape.** Most scans (clear bottles) stay single-tier on cheap Haiku. Hard bottles pay ~6× the per-scan cost (Haiku + Sonnet) but actually succeed. The amortised cost depends on how many real-world bottles are §24-shaped; eval harness #110 will measure.

**Tracking.** Two-tier shipped in PR #128 (`feat(scan): two-tier vision — Haiku first, Sonnet on failure`). Provider registry key: `anthropic-sonnet-4-6`. The retry site references `TIER_2_VISION_PROVIDER_KEY` from the registry so the swap point is one named constant.

---

## 25. Latin first-word-strip false match on sake grade descriptors

**What it is.** The Latin lookup expands a candidate like `Kizakura Perle` into both the verbatim form and a first-word-strip variant (`Kizakura`) so sub-line modifiers like "Perle" don't block the main-brand match. That heuristic backfires when the model returns a sake grade / style descriptor in `name_ja` instead of the actual brand. The first-word-strip then drops a bare descriptor (`junmai`, `daiginjo`, …) into the lookup candidates, where it can match an unrelated Sakenowa brand whose Latin name happens to start with that descriptor. The result surfaces as a confident-looking `matched_brand_only` divergence card pointing at completely the wrong sake.

**Example.** 2026-06-14 testing on a Kiku-Masamune bottle:

- Actual brand: `菊正宗 (Kiku-Masamune)` — big black calligraphic kanji centred on the label. Latin "JUNMAI TARU SAKE" on the side; 純米 + たるざけ as small descriptors.
- Haiku returned: `name_ja: "JUNMAI TARU SAKE", brewery_ja: "菊宮"` (truncated `菊正宗` → `菊` + fabricated `宮`), confidence 0.75.
- Sakenowa chain:
  - First-pass on the descriptor-as-brand: 0 rows.
  - Brand-only on `"JUNMAI TARU SAKE"`: 0 rows.
  - Brewery-only on the fabricated `菊宮`: 0 rows.
  - Field-swap: 0 rows.
  - Latin pass on `expandLatinBrandVariants("JUNMAI TARU SAKE")` = `["junmai taru sake", "junmai", "junmaitarusake"]`. The bare `"junmai"` (first-word strip) matched brand 3506 by 金虎酒造 — a Sakenowa entry whose Latin name happens to start with "Junmai". Routed to `matched_brand_only` with a divergence card pointing at the wrong brewery (`extracted: 菊宮`, `stored: 金虎酒造`).
- Real-world impact: visitor scans Kiku-Masamune, system surfaces a divergence card claiming a match for a completely unrelated 金虎酒造 sake.

**Status.** Two complementary fixes:

1. **Sake grade / style token blocklist** (`SAKE_GRADE_TOKENS` in `src/lib/sakenowa/lookup.ts`). When the first word of a Latin extraction is a known sake descriptor (`junmai`, `ginjo`, `daiginjo`, `honjozo`, `tokubetsu`, `kimoto`, `yamahai`, `nigori`, `taru`, `kijoshu`, `koshu`, …), the first-word-strip variant is suppressed. The verbatim and space-stripped forms still run — if a real brand IS literally called `"Junmai Taru Sake"` it'll still match, but the bare `"junmai"` no longer matches an unrelated brand.
2. **§24 tier-2 retry** also catches this case independently: the misleading `matched_brand_only` routing triggers a Sonnet retry, which on this image returns `菊正宗` cleanly with no divergence.

The two fixes layer: the blocklist prevents the wrong-brand divergence card on Haiku alone (when Sonnet retry is disabled or unavailable), and tier-2 covers the residual cases where Haiku's extraction is so wrong the descriptor lookup wouldn't have helped anyway.

**Tracking.** Both shipped in PR #128.

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

## 26. Category gap: visitor scans a non-sake Japanese bottle (shochu, awamori, mirin, plum-wine)

**What it is.** A visitor — typically a non-Japanese-reading tourist on the German shelf — picks up what they assume is a sake bottle but it's actually **shochu** (焼酎, distilled), **awamori** (泡盛, Okinawan distilled), **mirin** (味醂, sweet rice wine for cooking), **umeshu** (梅酒, plum liqueur), or **happoshu** / sake-adjacent beer. Visually these bottles often look identical to sake on the shelf — same shape, same paper wraps, same vertical kanji typography — and DACH shops frequently sit them side-by-side. The vision model reads the brand correctly, the action runs the full Sakenowa lookup chain, every pass misses because **Sakenowa is a sake-only catalogue**.

**Example.** 2026-06-14 testing on `21882.jpg`:

- Actual bottle: `赤兎馬 (Sekitoba)` by `濵田酒造 (Hamada Sangyo)` — a sweet-potato (`芋`) shochu, oak-barrel aged (`樫樽熟成`), from Kagoshima (`薩州`).
- All three category markers (`本格焼酎`, `芋`, `樫樽熟成`) printed on the right-side regulatory text.
- Sonnet (tier-2) read both fields correctly: `name_ja: "赤兎馬", brewery_ja: "濵田酒造", confidence: 0.82`. Vision pipeline did its job.
- Sakenowa chain: 0 rows on every pass. Brand `赤兎馬` doesn't exist there (it's shochu); the brewery `濱田酒造` does exist (brewery 783, Kagoshima — they make sake too) but the kanji variant `濵` ↔ `濱` isn't in our variants expansion. Even if it were, surfacing the brewery's *sake* lineup to a visitor holding a shochu bottle would be worse UX than `no_match`.

**Distinct from:** §22 (script-coverage gap — sake brand exists, kanji/Latin matching falls short) and §23 (stylized-label, model can't read). Here the model reads correctly and Sakenowa simply doesn't carry the product category.

**Status.** Documented, no rescue path in PR #128. Current UX:

- The action returns `no_match` with the `backLabelHint` UI string from PR #128: *"Tip: if the front label is stylized, try the back — the brewery name and kanji are usually clearer there."*
- That hint is **misleading** for §26 — the model already read the bottle correctly; a closer shot won't change the category-coverage gap.

**What would help long-term (separate issue):**

Add an `is_sake` / `category` field to `LabelScanExtractionSchema` so the model can explicitly flag the bottle's category (sake / shochu / awamori / mirin / umeshu / other-alcohol / non-alcohol / unknown). When the model returns non-sake, the action routes to a new state (`not_sake`) and the UI shows locale-aware copy like *"This looks like a shochu bottle. Yawaragi is a sake-only catalogue right now."* The visitor learns the actual category and stops trying to scan it. Single-pass cost (no extra vision call); small schema change.

Real product value beyond category-coverage: many DACH visitors genuinely can't tell sake from shochu at a glance — same wax-paper wrap, same vertical kanji, same shelf neighbour. Helping them identify the category IS a discovery feature, not a workaround.

The category-expansion question (does Yawaragi eventually catalogue shochu / awamori too?) is Phase 4+. Sakenowa doesn't cover those — would need a different data source, separate ingest, separate flavour vocabulary. Worth flagging as a strategic direction; not in scope here.

**Tracking.** Documented here. Follow-up feature issue: [#131](https://github.com/yawaragi-dev/yawaragi/issues/131) (`is_sake` schema field + `not_sake` state).

---

## Cross-references

- PRD [#105](https://github.com/yawaragi-dev/yawaragi/issues/105) — Phase 3 anonymous label scan, the umbrella for all of the above.
- ADR [docs/adr/0005-source-provenance.md](./adr/0005-source-provenance.md) — provenance taxonomy used for `llm_extracted`, `sakenowa_inferred`, and `cross_beverage_map` distinctions.
- ADR [docs/adr/0013-feature-debuggability-requirement.md](./adr/0013-feature-debuggability-requirement.md) — the debug-overlay rule that lets us diagnose any of the above from a phone in the wild.
- `/CONTEXT.md` — domain glossary, including the same-romaji-collision note (§11).
- Eval harness [#110](https://github.com/yawaragi-dev/yawaragi/issues/110) — the ground-truth dataset every "tune this against real data" claim above depends on.
- `pnpm sakenowa:freshness` (`scripts/sakenowa-freshness-check.ts`) — verifies the local mirror against Sakenowa's upstream API. Surfaces brand / brewery count deltas plus a canary check against well-known bottles. Use when a recurring scan failure smells like a data gap to confirm or refute the hypothesis before chasing code.

---

## How to use this doc

When a scan fails in the wild and the debug overlay shows you the trace, walk this list top-to-bottom and ask "is this what I'm seeing?". The first match is usually the obstacle in play. File new entries here as new failure shapes show up; the goal is for every distinct shape to have a name in this catalogue so we can talk about them precisely.

When a new entry's status moves from "proposed" or "open" to "implemented", update the **Status** line and add the PR / commit reference to the **Tracking** line. Don't delete entries — the historical context (what the obstacle looked like before the fix) is the part the blog series wants.
