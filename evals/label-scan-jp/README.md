# `evals/label-scan-jp/` — label-scan vision eval harness

Informational eval for the Phase 3 label-scan surface (PRD #105, slice #110).
It scores candidate `VisionProvider` implementations against a small labeled
set of JP sake-bottle-label photos and prints a **provider × metrics**
comparison table. That table is the input to the "Finetune & failover"
follow-up (fallback-vendor choice, switch policy, schema-richness re-eval).

**This is not a test.** No pass/fail; no CI wiring. It never runs in
`pnpm test` / `pnpm verify`. The only thing CI runs from this directory is
the metric-math unit test (`levenshtein.test.ts`).

---

## The corpus

**79 photos of 33 bottles**, all taken by the maintainer on a phone the way a
visitor would: in the hand, a little off-angle, sometimes with condensation on
the glass. 73 are of 27 bottles at home in ordinary room light; 6 are single
front shots of bottles on a shop shelf, added after the lookup had been tuned
on the first 73 and scored once, untouched — all six landed on the right sake. Each bottle was shot from several
sides, because a scan is only as good as the side the visitor points at:

| view | photos | what it shows |
|------|--------|---------------|
| `front` | 36 | the front label, square on |
| `side` | 12 | the label turned to one side |
| `back_ja` | 4 | a Japanese back or side label (the regulatory block) |
| `back_import` | 26 | the importer's German or French back label — sake and maker in Latin script only |
| `other` | 1 | a neck band |

The set is hard on purpose. It holds foil and brush-calligraphy brand marks,
a cup printed on clear glass, two boxes rather than bottles, sub-lines that
are their own catalogue row (あわ咲き, 黒兜, 別格), a brand the catalogue spells
in hiragana where the label uses kanji (せきのいち), and two bottles the
catalogue does not have at all, where the right answer is no match.

Photos are stored **as the scan action receives them**: longer edge 1024 px,
JPEG quality 0.85 — the numbers in `src/lib/scan/downscale.ts`. Scoring the
4K originals would flatter the model. The re-encode also drops the EXIF block,
so no location or device data is in the repo.

### Adding a photo

1. Photograph a bottle — **label only, never a person or a face** (CLAUDE.md,
   Art. 9). Dark glass reflects whoever holds the phone, in a shop especially:
   look at the bare glass before committing and blur a reflection.
2. Downscale it to a 1024 px longer edge at JPEG quality 0.85, re-encoding so
   the EXIF block is gone, and drop it into `photos/`.
3. Add an entry to `ground-truth.json` keyed by the filename.
4. Find the catalogue row it should land on (`brands.brand_id`) and list it in
   `expectedBrandIds` — or `[]` if the catalogue does not have the bottle.

---

## Filename / JSON convention

`ground-truth.json` is a flat map from **photo filename → expected answer +
provenance**:

```jsonc
{
  "dassai.jpg": {
    "name_ja": "獺祭",           // brand (銘柄), original script, SKU modifiers stripped
    "brewery_ja": "旭酒造",       // brewery, original script, legal-form suffixes stripped
    "bottle": "dassai-45",        // groups the photos of one physical bottle
    "view": "front",              // front | side | back_ja | back_import | other
    "expectedBrandIds": [887],    // catalogue rows a correct scan may land on; [] = not in the catalogue
    "also": { "name_ja": ["DASSAI"] }, // other readings that are also right (optional)
    "provenance": {
      "source": "maintainer_own_bottle", // see the source enum below
      "rightsCleared": true,             // MUST be true for a real photo to be scored
      "attribution": "…",                // required for cc_by / press_kit_licensed
      "notes": "photo of my own bottle, kitchen light"
    }
  }
}
```

- `name_ja` / `brewery_ja` are exactly the two fields `LabelScanExtraction`
  carries, so the metric compares like with like. Follow the same
  script-preservation + stripping rules the vision system prompt uses
  (`src/lib/ai/vision/anthropic-haiku-provider.ts`): keep the script the label
  is printed in (kanji / katakana / hiragana / Latin), strip grade/polishing/
  style modifiers from the brand, strip legal-form markers (株式会社 etc.) from
  the brewery.
- `also` exists because a label that prints its brand in kanji, katakana and
  Latin has three correct readings; a field is scored against the best of them.
  Keep it to what the label actually prints.
- `expectedBrandIds` is what turns "did it read the label" into "did the scan
  land on the right sake". Left out, the photo is scored on extraction only.
- The shape is validated by `schemas.ts` (`GroundTruthFileSchema`) at start-up.
  A malformed entry crashes with a readable Zod error rather than a silent
  metric miscalculation.

### Photo provenance / rights documentation requirements

Every entry's `provenance.source` is drawn from a closed enum
(`PhotoRightsSourceSchema` in `schemas.ts`):

| source | meaning | `attribution` |
|--------|---------|---------------|
| `maintainer_own_bottle` | you photographed a bottle you own | optional |
| `maintainer_shop_photo` | you photographed a bottle on a shop shelf | optional |
| `public_domain` | PD product shot (age or explicit dedication) | recommended (source URL) |
| `cc0` | CC0-dedicated image | recommended (source URL) |
| `cc_by` | CC-BY image | **required** (source URL + attribution line) |
| `press_kit_licensed` | brewery/importer press-kit image, licence permits use | **required** (grant) |
| `synthetic_smoke_fixture` | the pipeline smoke image — not a real photo | n/a |

Rules the harness enforces:

- A non-smoke entry with `rightsCleared: false` is **skipped** (never sent to a
  provider, never scored) with a visible "rights not cleared" line. This is the
  gate: an uncleared photo cannot leak into a run.
- `cc_by` / `press_kit_licensed` without an `attribution` string is a schema
  error — you can't ship an attributed licence without recording the
  attribution.

---

## Run

```bash
pnpm eval label-scan-jp
```

Env the runner reads:

- `LABEL_SCAN_EVAL_PROVIDERS` — comma-separated registry keys to compare
  (e.g. `anthropic-haiku-5-5,anthropic-sonnet-5-5`). Optional.
- `LABEL_SCAN_EVAL_THROTTLE_MS` — sleep between real-provider calls
  (default `1000`). Keeps a 20-photo run from bursting the Anthropic API.
- `DATABASE_URL` — the Sakenowa mirror. With it set, the runner also resolves
  each extraction against the catalogue (see "Where the scan landed"). Without
  it, only the extraction is scored.
- `LABEL_SCAN_EVAL_OFFLINE=1` / `LABEL_SCAN_EVAL_FRESH=1` — see "Saved reads".
- `LABEL_SCAN_EVAL_INCLUDE_SMOKE=1` — also score the synthetic smoke fixture
  even when real photos are present (normally it's only used as the fallback
  when `photos/` is empty).

Env the *providers* read (same as production scan, via `src/env.ts`):
`ANTHROPIC_API_KEY` for the Anthropic providers; the registry import also
requires the app's baseline env (`CLERK_SECRET_KEY`,
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CRON_SECRET`) because it pulls `@/env`.
`.env.local` already carries these for local dev.

> The `pnpm eval` script runs tsx with `--conditions=react-server`. The
> label-scan runner imports the `server-only` vision registry directly (unlike
> the suggest eval, which goes over HTTP); the condition resolves the
> `server-only` marker to its empty shim exactly as the Next.js RSC bundler
> does in production. See `scripts/eval.ts` for the full note.

### Saved reads — what a run costs

Every model read is saved to `recordings/reads.json`, keyed by **provider,
prompt and photo**, and the next run reuses it. A model is called only for a
photo it has not yet read with the current prompt:

| what changed since the last run | model calls |
|---------------------------------|-------------|
| the catalogue lookup, the ground truth, nothing | none |
| three new photos | three per provider |
| a new provider key | one per photo, for that provider |
| the vision prompt | every photo, every provider |

```bash
# the usual loop while working on the lookup: free, about half a minute
LABEL_SCAN_EVAL_OFFLINE=1 LABEL_SCAN_EVAL_PROVIDERS=anthropic-haiku-5-5,anthropic-sonnet-5-5 pnpm eval label-scan-jp
```

- `LABEL_SCAN_EVAL_OFFLINE=1` never calls a model; a photo without a saved
  read counts as an error rather than as a charge.
- `LABEL_SCAN_EVAL_FRESH=1` ignores the saved reads and asks again. Models are
  not deterministic, so this is the way to see the spread, and the only
  reason to pay twice. It overwrites `reads.json`: copy the file first if the
  committed reads should stay.

A fresh read of both tiers costs about $0.45 (2026-10-13: $0.035 for Haiku
5.5, $0.43 for Sonnet 5.5). The instructions are cached between calls, and
the cost line says how many input tokens were read from the cache; in a full
run that is about 81%.

### How much a run varies

Models are not deterministic. Seven reads of these 79 photos, same lookup, the
shipped tier pair, all but the first on 2026-10-13:

| reads | prompt | right | in a list | wrong | no answer |
|---|---|---|---|---|---|
| committed until then | as merged in #411 | 74 | 2 | 1 | 2 |
| fresh 1 | the same | 72 | 1 | 2 | 4 |
| fresh 2 | the same | 71 | 2 | 2 | 4 |
| fresh 3 | the same | 72 | 2 | 1 | 4 |
| fresh 4 | + `brewery_printed` | 74 | 2 | 1 | 2 |
| fresh 5 (`reads.json`) | + what the photo shows, the drink, the bottling | 71 | 2 | 3 | 3 |
| fresh 6 | the same as 5 | 73 | 2 | 1 | 3 |

So a single scan is right on about 90–94% of these photos, and one run says
little about a difference of two photos. Over the first four rows: 69 photos
right every time, 7 changing from run to run, 3 never right (the two Ninki
back labels, which give a list, and the Kurokabuto front).

Two photos end in a confident wrong answer, and by the same route. The model
misreads brush calligraphy as a famous brand, then supplies that brand's
brewery, which the label does not print — so brand and brewery "agree" and the
lookup calls it exact:

- `dewazakura_yukimegami_clear.jpg`: Haiku 5.5 read 獺祭 / 旭酒造 in every
  fresh run (0.80–0.92). Sonnet 5.5 read it correctly every time, but tier 1's
  exact match was never passed on to tier 2.
- `ikekame_junmai_ginjo_nama_clear.jpg`: Sonnet 5.5 reads 黒龍 / 黒龍酒造 in
  most runs (0.62–0.85).

The read now says whether the brewery is printed in the photo
(`brewery_printed`), and both models answer "no" for both photos. Tier 1's
exact match stands only when its brewery was printed; otherwise tier 2 is
asked. On the fresh-4 reads that sends 14 more of the 79 photos to tier 2 (47
instead of 33), turns the Dewazakura front right, and changes no other
answer. An earlier attempt without the field — ask tier 2 whenever tier 1's
match leaves a printed name unexplained — sent 21–23 more and once turned a
right answer into none.

It does not help the Kurokabuto front: there the wrong read is tier 2's own,
and nothing in the photo contradicts it. In the final answers 29 exact matches
rest on a brewery that is not printed, and 28 of them are right, so the flag
alone cannot tell that one apart. A second photo does
(`pnpm eval label-scan-pairs`).

### What the photo shows, what the drink is, the bottling

A read also says what the photo shows (`subject`: one bottle, several
bottles, a menu), what the drink is as the label prints it (`drink`), and what
the label says about the bottling (`bottling`: product name, grade, style
words, polishing ratio). The scan answers a menu, several bottles or a bottle
that is not sake without asking the catalogue, and this run judges them the
same way (`src/lib/scan/read-kind.ts`); "not sake" and "not one bottle" are
tier 2's to say.

These 79 photos are all of one sake bottle, so here the fields can only do
harm, and the committed reads show how much: neither model calls a sake
another drink or sees more than one bottle; the drink is left `unknown` on 5
(Haiku 5.5) and 9 (Sonnet 5.5) labels that print the name alone, which are
looked up as before; a grade is read on 58 photos and a product name on 38.
Whether the fields do their job is measured on photos of shochu, awamori, a
menu and two bottles in one frame, which arrive with the next batch of photos.

The longer prompt is not free. Sonnet 5.5 alone was right on 74 of the 79 with
the fresh-4 prompt and on 72 in both runs with the longer one; two Choryo photos with
the label cut off and the Shichiken neck band were right before and are not in
either later run.

The confidence gate was checked against these runs and the larger set (0.60
is where it stands): at 0.30 no more photos are right and 14 more are wrong;
at 0.65 eleven fewer are right and three fewer wrong. Only tier 2's gate
matters — tier 1 stands on an exact match alone, which the gate does not
touch.

The file holds the reads of the two tiers the scan runs. The tiers before them
(`anthropic-haiku-4-5`, `anthropic-sonnet-4-6`) were last read with an earlier
prompt, so naming them in a run reads every photo again.

Because the reads are fixed, two runs differ only by what the code did with
them: a lookup change shows as exactly its own effect. Commit `reads.json`
with the change that produced it. Latency in a run of saved reads is the
latency recorded when the read was made.

### Smoke test (no Anthropic credit)

```bash
LABEL_SCAN_EVAL_PROVIDERS=e2e-stub pnpm eval label-scan-jp
```

The `e2e-stub` provider returns a fixed Dassai extraction with no network I/O,
so every real photo scores as a wrong answer — which is the point: it proves
the whole pipeline (corpus discovery → Blob → `extractLabel` → metric →
catalogue lookup → tables) runs, at no cost.

---

## Two photos of one bottle — `pnpm eval label-scan-pairs`

A scan that does not settle on one sake is remembered for a few minutes, and the next photo is resolved with both reads (#408). `pnpm eval label-scan-pairs` measures that rule on this corpus. It calls no model: it replays the saved reads of the shipped tier pair through the real lookup, for every ordered pair of photos ("first scan A, second scan B"). It needs `DATABASE_URL` and nothing else.

It answers two questions:

- **Different bottles.** A second photo's own answer is never changed, so this counts how often the earlier read still put a guess beside it. Across different breweries that must be never, and the run exits non-zero if it happens. Two bottles of one brewery share a field, so a guess can appear; each is listed.
- **The same bottle.** Of the second scans with no single answer of their own, how many get the right sake from the two reads together.

On 2026-10-13 (79 photos, 33 bottles, the committed reads):

| | pairs | result |
|---|---|---|
| Second photo gives one sake by itself, earlier read not consulted | 5,382 | unchanged by rule |
| Different bottles, second photo has no single answer | 761 | 0 guesses across breweries, 2 within one brewery (both the right sake) |
| Same bottle, second photo has no single answer | 19 | 15 right with both reads, 0 wrong, 4 still nothing |

Eight of those 15 are bottles the catalogue lacks, where "no guess" is the right answer; seven are real rescues (Choryo's cut-off labels twice, the two Ninki back labels, the Shichiken neck band three times). The four with nothing are pairs of Choryo photos neither of which was read. Which photos need rescuing changes with the reads: on the reads of the day before it was 14 pairs with five rescues.

A photo that comes with an earlier read goes straight to tier 2. Replayed for every second photo of a bottle whose first photo was not a sure match, over three reads of the larger photo set (240 pairs): 208 right by tier 2 alone against 205 through both tiers, with a median wait of about 4 s against 9 s.

The sample is small: 69 of 79 photos already give one sake alone.

## Adding a candidate provider to the run

Providers are named keys into the vision registry
(`src/lib/ai/vision/registry.ts`): `anthropic-haiku-5-5` and
`anthropic-sonnet-5-5` (the two tiers the scan runs today),
`anthropic-haiku-4-5` and `anthropic-sonnet-4-6` (the tiers before them, kept
for comparison), `e2e-stub`. To compare a new vendor:

1. **Register it.** Add a factory + key to `visionProviderFactories` in the
   registry (that's the vendor-swap seam the whole Phase 3 design protects —
   a new vendor is a registry entry implementing `VisionProvider`, not a
   rewrite). The new key flows into `VISION_PROVIDER_KEYS` automatically.
2. **List it in the run**, either:
   - `LABEL_SCAN_EVAL_PROVIDERS=anthropic-haiku-5-5,<new-key> pnpm eval label-scan-jp`, or
   - create `evals/label-scan-jp/providers.json` — a JSON array of keys, e.g.
     `["anthropic-haiku-5-5", "anthropic-sonnet-5-5"]`. Env wins over the file;
     the file wins over the default (the tier-1 key alone).
3. **Re-run** and paste the multi-row comparison table into the finetune/
   failover writeup. Unknown keys abort before any paid call.

The runner is strictly serial (one provider, one photo at a time), so adding
providers multiplies runtime by (providers × photos × throttle) — about ten
minutes for two Anthropic tiers reading all 73 photos for the first time, and
nothing once those reads are saved.

---

## Metric — how it's computed

For each photo, per field (`name_ja`, `brewery_ja`):

```
charAccuracy = 1 - levenshtein(expected, actual) / max(len(expected), len(actual))
```

- **Levenshtein distance** (`levenshtein.ts`) is the classic edit distance
  (insert / delete / substitute, unit cost), measured over **Unicode
  codepoints** — one visual kanji is one token, even the rare astral-plane
  ones. Unit-tested in `levenshtein.test.ts`.
- Normalising by the longer of the two lengths keeps the score in `[0, 1]`
  even when the model hallucinates a much longer string than the ground truth
  (a common failure: returning the full label including SKU modifiers instead
  of the stripped brand).
- **Exact-match** for a photo = `name_ja` exact **and** `brewery_ja` exact.
- Where the entry lists `also` readings, each field takes its best score over
  the expected reading and those.

Per provider the table reports the **mean** name accuracy, **mean** brewery
accuracy, the **exact-match rate** (fraction of photos both-fields-exact), and
the **median latency** in ms.

Why character-level accuracy rather than a binary right/wrong: OCR-style
extraction fails gradually. A provider that returns 獺 for 獺祭 (0.5) is
meaningfully better than one that returns 八海山 (0.0), and the downstream
Sakenowa lookup can still recover from a near-miss. A binary metric would
throw that signal away.

---

## Reading the comparison table

Two tables print to stdout, both pastable into GitHub:

- **Comparison** — one row per provider: `scored`, `errors`, `name_ja acc`,
  `brewery_ja acc`, `exact-match rate`, `median latency (ms)`. This is the
  ranking. Higher accuracy + exact-match, lower latency, fewer errors is
  better. `errors` counts provider throws (bad image, API failure); a provider
  that fails to construct (e.g. missing `ANTHROPIC_API_KEY`) shows a
  `construction failed` row instead of silently scoring 0.
- **Per-photo detail** — one row per (provider, photo): the actual
  `name_ja / brewery_ja` the provider returned, so a failure mode ("Haiku read
  the retailer 柴田屋酒店 as the brewery") is diagnosable directly from the
  table without opening Langfuse.

- **Where the scan landed** (needs `DATABASE_URL`) — one row per provider and
  view. Each extraction goes through `resolveScannedLabel`, the same guards and
  lookup cascade the scan action runs, and the result is judged against
  `expectedBrandIds`:

  | verdict | meaning |
  |---------|---------|
  | `right` | one sake, and it is the bottle — or, for a bottle the catalogue lacks, no match |
  | `in list` | several candidates, the bottle among them |
  | `wrong` | a sake that is not the bottle |
  | `none` | no answer for a bottle the catalogue has |

  `wrong` is the costly one: the visitor is shown a sake they are not holding.
  `none` only sends them to search.

  **`right ungated`** is the `right` count with the model's self-reported
  confidence read as 1. The scan drops any read below 0.60 before the lookup
  runs, and models differ a great deal in how they score themselves; the gap
  between `right` and `right ungated` is what that gate costs a given model.
  The per-photo table prints each read's confidence after an `@`.

  When both tiers of a pair are in the run, a **`two-tier (…)`** row replays
  the scan action's rule from the reads already made — tier 1 stands only on a
  first-pass exact match, anything else is tier 2's answer. `two-tier (as
  shipped)` is the pair the scan runs today and the number a visitor
  experiences; `two-tier (Haiku 4.5 → Sonnet 4.6)` is the pair before it. Latency adds both
  calls on a retry.

This table reads character accuracy and catalogue resolution separately on
purpose. A model can read 福寿 perfectly off a bottle whose catalogue row is
あわ咲き, and a model can misread a brewery and still land on the right sake
through the brand-only pass.

---

## Files

- `ground-truth.json` — filename → `{ name_ja, brewery_ja, bottle, view, expectedBrandIds, also, provenance }`.
- `schemas.ts` — Zod shapes the ground-truth file is parsed against.
- `levenshtein.ts` / `levenshtein.test.ts` — the metric math + its unit test.
- `photos/` — the corpus, at scan-action size.
- `recordings/reads.json` — the saved model reads.
- `fixtures/synthetic-smoke-label.jpg` — deterministic 1×1 JPEG smoke fixture
  (pipeline proof only — never a real eval photo).
- `providers.json` — optional provider list (not committed; create if you want
  a file-based list instead of the env var).

`scripts/eval.ts` dispatches; `scripts/eval-label-scan-jp.ts` runs.

---

## Compliance

- **No Art. 9 special-category data.** Photos are bottle labels only — never
  people / faces (CLAUDE.md). The provenance enum has no "photo of a person"
  option by construction.
- **Image retention.** These eval photos live in the repo as fixtures with the
  maintainer's cleared rights — that's distinct from the production scan flow,
  which process-and-discards a visitor's uploaded image after the inference
  call (ADR-0009). Do not add a visitor's uploaded photo here.
- **Anthropic processing posture.** Running a real provider sends each photo to
  Anthropic `/v1/messages` as inline base64 — same posture as a production
  scan (7-day standard retention per ADR-0009 RoPA; ZDR pending). Never the
  Files API. Only run against photos whose rights you hold.
