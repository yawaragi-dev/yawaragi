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

**Status.** Implemented. Same prompt section as §1.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), `src/lib/ai/vision/anthropic-haiku-provider.ts`.

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

**Status.** Implemented (interim). Threshold lowered to 0.70 (commit `f6e5568`). Permanent calibration depends on the eval harness landing first so we have ground-truth data to fit a threshold against, rather than eyeballing distributions.

**Tracking.** PR [#117](https://github.com/yawaragi-dev/yawaragi/pull/117), commit `f6e5568`. Long-term calibration blocked by eval harness [#110](https://github.com/yawaragi-dev/yawaragi/issues/110) and finetune decision [#113](https://github.com/yawaragi-dev/yawaragi/issues/113).

---

## 8. Hand-brushed calligraphy and character-shape substitutions

**What it is.** Sake brands love calligraphy. A hand-brushed `龍` may flatten a stroke and read as `竜` (already in the variant pair from §3 — caught) but it may also read as `龕` or `籠` (not in the pair list — missed). And it's not always old/new form — sometimes it's plain visual confusion: stylised fonts collapse stroke counts in ways the variant pair list can't enumerate.

The variant-kanji approach from §3 catches the dominant `旧字体 ↔ 新字体` failure mode but is structurally exact-match underneath. A residual class of misses needs a similarity-based approach.

**Example.** A heavily-brushed brand kanji where the model returns one character off and the variant-pair list doesn't bridge the gap. (We haven't yet hit one in production; this is anticipated rather than observed.)

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
