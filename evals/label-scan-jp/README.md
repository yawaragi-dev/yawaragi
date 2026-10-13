# `evals/label-scan-jp/` — label-scan vision eval harness

Informational eval for the Phase 3 label-scan surface (PRD #105, slice #110).
It scores candidate `VisionProvider` implementations against a small labeled
set of JP sake-bottle-label photos and prints a **provider × metrics**
comparison table. That table is the input to the "Finetune & failover"
follow-up (fallback-vendor choice, switch policy, schema-richness re-eval).

**This is not a test.** No pass/fail; no CI wiring. It never runs in
`pnpm test` / `pnpm verify`. The only thing CI runs from this directory is
the metric-math and judging unit tests (`levenshtein.test.ts`, `judge.test.ts`).

---

## The corpus

**118 photos**, all taken by the maintainer on a phone the way a visitor
would: in the hand, a little off-angle, sometimes with condensation on the
glass. **110 are of one sake bottle each (61 bottles)** and make the headline
number; 8 show something a scan was not built for and are reported apart (see
"Photos that are not one sake bottle").

Of the 110, 73 are of 27 bottles at home in ordinary room light; 6 are single
front shots of bottles on a shop shelf, added after the lookup had been tuned
on the first 73 and scored once, untouched — all six landed on the right sake;
and 31 more shop-shelf fronts were added on 2026-10-13 (28 new bottles, a
second photo of one of them, and a shelf copy of two bottles already in the
set). The bottles at home were shot from several sides, because a scan is only
as good as the side the visitor points at:

| view | photos | what it shows |
|------|--------|---------------|
| `front` | 67 | the front label, square on |
| `side` | 12 | the label turned to one side |
| `back_ja` | 4 | a Japanese back or side label (the regulatory block) |
| `back_import` | 26 | the importer's German or French back label — sake and maker in Latin script only |
| `other` | 1 | a neck band |

The set is hard on purpose. It holds foil and brush-calligraphy brand marks,
a cup printed on clear glass, two boxes rather than bottles, sub-lines that
are their own catalogue row (あわ咲き, 黒兜, 別格), a brand the catalogue spells
in hiragana where the label uses kanji (せきのいち), and bottles the
catalogue does not have at all, where the right answer is no match (five:
北鹿 雪, 濃姫の里 隠し吟醸, 関原酒造's two 越後, 東京盛).

The shop-shelf photos add what a shelf adds: a neighbouring bottle legible at
the edge of the frame, a label half behind the shelf rail, a shelf tag that
names the sake in Latin, bottles wrapped in film or tissue, and labels whose
largest text is not the brand (山田錦, 男酒, 吟麗).

Photos are stored **as the scan action receives them**: longer edge 1024 px,
JPEG quality 0.85 — the numbers in `src/lib/scan/downscale.ts`. Scoring the
4K originals would flatter the model. The re-encode also drops the EXIF block,
so no location or device data is in the repo.

### Adding a photo

1. Photograph a bottle — **label only, never a person or a face** (CLAUDE.md,
   Art. 9). Dark glass reflects whoever holds the phone, in a shop especially:
   look at the bare glass before committing and blur a reflection. A hand
   holding the bottle is fine as long as nothing on it identifies anyone (a
   ring, a tattoo, a watch). No receipt, no address, no other shopper.
2. Downscale it to a 1024 px longer edge at JPEG quality 0.85, re-encoding so
   the EXIF block is gone, and drop it into `photos/`.
3. Add an entry to `ground-truth.json` keyed by the filename.
4. Find the catalogue row it should land on (`brands.brand_id`) and list it in
   `expectedBrandIds` — or `[]` if the catalogue does not have the bottle.
5. If the photo is not of one sake bottle, say so with `drink`, or with
   `subject` and `items` (see "Photos that are not one sake bottle").
6. Run the eval offline. It lists the new photo under "Not read yet" and says
   how many model calls reading it will take; the same command without
   `LABEL_SCAN_EVAL_OFFLINE=1` then reads the new photos and nothing else.

---

## Filename / JSON convention

**A photo keeps the file name the maintainer gave it.** The name is their note
of what is in the frame — maker, brand, product, grade, then the condition of
the shot (`ozawa_sawanoi_otoko_zake_honjozo_dai_karakuchi_clear.jpg`,
`..._with_pricetag`, `..._wrapped`, `two_bottles_..._AND_...`, `..._menu_...`)
— and it is the first check on the ground truth: where the label, the
catalogue and the name disagree, say so in the entry's `notes` and ask, rather
than renaming the file to fit. The romaji in a name is informal and is not
ground truth by itself.

`ground-truth.json` is a flat map from **photo filename → expected answer +
provenance**:

```jsonc
{
  "dassai.jpg": {
    "name_ja": "獺祭",           // brand (銘柄), original script, SKU modifiers stripped
    "brewery_ja": "旭酒造",       // brewery, original script, legal-form suffixes stripped
    "bottle": "dassai-45",        // groups the photos of one physical bottle (sake bottles only)
    "view": "front",              // front | side | back_ja | back_import | other
    "expectedBrandIds": [887],    // catalogue rows a correct scan may land on; [] = not in the catalogue
    "also": { "name_ja": ["DASSAI"] }, // other readings that are also right (optional)
    // "subject", "drink", "items": only when the photo is not of one sake bottle — see below
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

### Photos that are not one sake bottle

A visitor will point the camera at things the scan was not built for. Three
kinds are in the corpus, each marked in its ground-truth entry and each with
its own right answer, because "right" can no longer mean "landed on this
sake". They are **never counted in the headline**: the comparison table and
"Where the scan landed" hold photos of one sake bottle only, and these print
in a table of their own, so adding one does not move "right of N".

| kind | how the entry says so | photos | right today |
|------|-----------------------|--------|-------------|
| a bottle that is not sake | `"drink": "shochu"` (or `awamori`, `umeshu`, `liqueur`, `other`) | 6 | no sake shown |
| several bottles | `"subject": "several_bottles"` + `items` | 1 | the `main` bottle if there is one; otherwise no single sake |
| a menu | `"subject": "menu"` + `items` | 1 | no single sake |

```jsonc
// a bottle that is not sake
"mitsutake_shuzo_makai_e_no_izanai_black_koji_shochu_clear.jpg": {
  "name_ja": "魔界への誘い", "brewery_ja": "光武酒造場",
  "drink": "shochu",
  "expectedBrandIds": [3935]   // the catalogue row for THIS product, if Sakenowa lists it; usually []
}
// several bottles, or a menu
"two_bottles_tsukasa_sjochu_AND_aioi_shochu_with_pricetag.jpg": {
  "name_ja": "ソフトツカサ", "brewery_ja": "美峰酒類",   // required fields: the main item, else the first
  "subject": "several_bottles",
  "items": [
    { "name_ja": "ソフトツカサ", "brewery_ja": "美峰酒類", "drink": "shochu", "expectedBrandIds": [] },
    { "name_ja": "相生焼酎", "brewery_ja": "相生ユニビオ", "drink": "shochu", "expectedBrandIds": [] }
    // "main": true on the one bottle that is clearly the subject — centred, largest, in focus
  ]
}
```

The verdicts are the usual four plus one, `in photo`. The rules live in
`judge.ts` and are unit-tested in `judge.test.ts`:

- **A bottle that is not sake.** The catalogue is sake only, so any sake shown
  is one the visitor is not holding: `right` is no match (or a read dropped
  for low confidence), `wrong` is a sake, alone or in a list. Watch the
  hazards the entries' notes name: several shochu makers also brew sake and
  are in the catalogue (濱田酒造, 西酒造, 光武酒造場), and 瑞泉 the awamori
  shares its name with a sake. Sakenowa even lists a few such products;
  `expectedBrandIds` then names that row, and landing on it is `in photo` —
  the name is the bottle's, but the flavor data beside it is not sake data.
  `drink` records what the bottle is, so a later "this is not sake" answer
  can be scored against it without touching the photos.
- **A menu.** Menu scan is deferred (design §7, screenshot 33) and the camera
  is label-only, so today the right answer is the one that sends the visitor
  on to search: no single sake. One sake presented as if the menu were a
  bottle is `wrong`, or `in photo` if it is at least on the page. `items`
  lists every drink legibly printed, with catalogue rows where they exist, so
  that a menu scan can be scored on the same photos when it is built: per
  item, did it find the row.
- **Several bottles.** If one bottle is clearly the subject, mark it `main`
  and the photo is judged as that bottle; another bottle from the frame is
  `in photo`. If none is, the right answer is again no single sake: the
  result screen says "this is your bottle", and choosing one of two equal
  bottles answers a question the visitor did not ask. A list that holds one
  of them is `in list`. A bottle standing at the edge of a shop shelf does not
  make a photo `several_bottles`; name it in the notes.

These entries carry no `bottle` group (the schema refuses one): it groups the
photos of one sake bottle, and `pnpm eval label-scan-pairs` reads it to pair
them, so the pairs eval leaves these photos out.

### Photo provenance / rights documentation requirements

Every entry's `provenance.source` is drawn from a closed enum
(`PhotoRightsSourceSchema` in `schemas.ts`):

| source | meaning | `attribution` |
|--------|---------|---------------|
| `maintainer_own_bottle` | you photographed a bottle you own | optional |
| `maintainer_shop_photo` | you photographed a bottle on a shop shelf | optional |
| `maintainer_menu_photo` | you photographed a printed menu at a restaurant or bar; the page's wording and layout are the venue's | optional |
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
| three new photos | three per provider, for those three only |
| a new provider key | one per photo, for that provider |
| the vision prompt | every photo, every provider |

```bash
# the usual loop while working on the lookup: free, about half a minute
LABEL_SCAN_EVAL_OFFLINE=1 LABEL_SCAN_EVAL_PROVIDERS=anthropic-haiku-5-5,anthropic-sonnet-5-5 pnpm eval label-scan-jp
```

- `LABEL_SCAN_EVAL_OFFLINE=1` never calls a model; a photo without a saved
  read counts as an error rather than as a charge. The run lists those photos
  under "Not read yet" with the number of model calls reading them takes —
  run it first, because a changed prompt makes that every photo.
- `LABEL_SCAN_EVAL_FRESH=1` ignores the saved reads and asks again. Models are
  not deterministic, so this is the way to see the spread, and the only
  reason to pay twice. It overwrites `reads.json`: copy the file first if the
  committed reads should stay.

A fresh read of both tiers costs about $0.45 (2026-10-13: $0.035 for Haiku
5.5, $0.43 for Sonnet 5.5). The instructions are cached between calls, and
the cost line says how many input tokens were read from the cache; in a full
run that is about 81%.

### How much a run varies

Models are not deterministic. Seven reads of the 79 photos the set held until
2026-10-13, same lookup, the shipped tier pair, all but the first on that day:

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

Since 2026-10-13 a read also says what the photo shows (`subject`: one bottle,
several bottles, a menu), what the drink is as the label prints it (`drink`),
and what the label says about the bottling (`bottling`: product name, grade,
style words, polishing ratio). The scan answers a menu, several bottles or a
bottle that is not sake without asking the catalogue; this run judges them the
same way (`src/lib/scan/read-kind.ts`).

On the 118 photos (110 of one sake bottle, 6 not sake, 1 menu, 1 two bottles),
committed reads:

| | Haiku 5.5 | Sonnet 5.5 |
|---|---|---|
| Not sake, called what it is (of 6) | 6 | 6 |
| A sake called another drink (of 110) | 0 | 0 |
| Sake photos with the drink left `unknown` (name-only labels) | 10 | 15 |
| Menu and two-bottle photo recognised (of 2) | 2 | 2 |
| One bottle called "several bottles" (of 116) | 2 | 0 |
| Grade agrees with the one in the file name, where both exist | 69 of 71 | 70 of 72 |

Before the fields existed the shipped pair got 2 of those 8 photos right: the
shochu bottles came back as their makers' sakes, and the menu as a sure match
for a sake of the same name. With them it gets 8 of 8. Because tier 1 twice
saw several bottles where there was one, "not sake" and "not one bottle" are
tier 2's to say.

The grade has no ground truth of its own; the file names are the maintainer's
notes, so the last row is a sanity check. The two disagreements were one
bottle, the Ninki sparkling, whose file names said junmai daiginjo where both
labels print 純米吟醸; the reads were right and the files are renamed.

Two fresh reads with these fields scored 98 and 101 right of the 110 sake
photos (the first is committed), against 103 for the one read made with the
shorter prompt an hour earlier. Over those three runs 95 photos are right
every time, 10 change and 5 never are. Three of the ten — two Choryo photos
with the label cut off and the Shichiken neck band — were right with the
shorter prompt and not in either run with the longer one, so the longer
prompt probably costs two or three photos in 110; the rest is the run-to-run
noise measured above. The eight photos it fixes were confident wrong answers.

The confidence gate was checked against all seven saved runs (0.60 is where
it stands): at 0.30 no more photos are right and 14 more are wrong; at 0.65
eleven fewer are right and three fewer wrong. Only tier 2's gate matters — tier 1
stands on an exact match alone, which the gate does not touch.

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

On 2026-10-13, for the 79 photos of 33 bottles the set held until then (the committed reads):

| | pairs | result |
|---|---|---|
| Second photo gives one sake by itself, earlier read not consulted | 5,382 | unchanged by rule |
| Different bottles, second photo has no single answer | 761 | 0 guesses across breweries, 2 within one brewery (both the right sake) |
| Same bottle, second photo has no single answer | 19 | 15 right with both reads, 0 wrong, 4 still nothing |

Eight of those 15 are bottles the catalogue lacks, where "no guess" is the right answer; seven are real rescues (Choryo's cut-off labels twice, the two Ninki back labels, the Shichiken neck band three times). The four with nothing are pairs of Choryo photos neither of which was read. Which photos need rescuing changes with the reads: on the reads of the day before it was 14 pairs with five rescues.

A photo that comes with an earlier read goes straight to tier 2. Replayed for every second photo of a bottle whose first photo was not a sure match, over three reads of the larger photo set (240 pairs): 208 right by tier 2 alone against 205 through both tiers, with a median wait of about 4 s against 9 s.

On all 110 sake-bottle photos (61 bottles) the same reads give 27 same-bottle pairs where the second photo had no answer of its own: 23 right with both reads, 0 wrong, 4 still nothing, and again no guess carried across breweries.

The sample is small: most photos already give one sake alone.

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

- **Not read yet** (offline runs only) — the photos no model has read with
  the current prompt. They are errors in the tables below, not misses.
- **Comparison** — one row per provider, over photos of one sake bottle: `scored`, `errors`, `name_ja acc`,
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

- **Photos that are not one sake bottle** (needs `DATABASE_URL`) — one row per
  provider and kind, with the verdicts above plus `in photo`, and `not read`
  for photos without a saved read. Never added to the rows above.

This table reads character accuracy and catalogue resolution separately on
purpose. A model can read 福寿 perfectly off a bottle whose catalogue row is
あわ咲き, and a model can misread a brewery and still land on the right sake
through the brand-only pass.

---

## Files

- `ground-truth.json` — filename → `{ name_ja, brewery_ja, bottle, view, expectedBrandIds, also, subject, drink, items, provenance }`.
- `schemas.ts` — Zod shapes the ground-truth file is parsed against.
- `judge.ts` / `judge.test.ts` — what counts as right for each kind of photo, and its unit test.
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

**Menu photos are not in the repository.** A photo whose file name contains
`menu` is ignored by git (`.gitignore`) and exists only on the maintainer's
machine. A plain typed list of names and prices is not protected, but a
designed menu usually carries the venue's descriptive text, artwork, and a
product photograph that belongs to someone else again; German law has no
exception that covers making a photo of that publicly available, and telling
the two kinds apart photo by photo is a legal judgment not worth making. The
ground-truth entry and the saved reads of a menu photo are committed — drink
names, sizes and prices are facts — so the numbers can be replayed offline by
anyone, and a fresh read only by the maintainer. `rightsCleared: true` on a
`maintainer_menu_photo` entry therefore means cleared to run, not to publish.
Shop-shelf and bottle photos are published as before; crop a shop's name and
any written shelf card out of the frame. Third-party labels, menus and marks
shown in these photos remain their owners' property.

- **No Art. 9 special-category data.** Photos are bottle labels only — never
  people / faces (CLAUDE.md). The provenance enum has no "photo of a person"
  option by construction. A drawn portrait on a label (福正宗) is artwork, not
  a person. A menu photo frames the page: no staff, no other guests.
- **Image retention.** These eval photos live in the repo as fixtures with the
  maintainer's cleared rights — that's distinct from the production scan flow,
  which process-and-discards a visitor's uploaded image after the inference
  call (ADR-0009). Do not add a visitor's uploaded photo here.
- **Anthropic processing posture.** Running a real provider sends each photo to
  Anthropic `/v1/messages` as inline base64 — same posture as a production
  scan (7-day standard retention per ADR-0009 RoPA; ZDR pending). Never the
  Files API. Only run against photos whose rights you hold.
