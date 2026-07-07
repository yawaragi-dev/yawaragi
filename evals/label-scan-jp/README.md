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

## 🚧 MAINTAINER TODO: add 20 real bottle-label photos with cleared rights

**The harness is complete and runs today, but the photo corpus is empty.** An
agent cannot source or rights-clear real photographs — that is inherently a
human task. Until you add photos, the runner falls back to a single synthetic
smoke fixture and prints a `DEGRADED CORPUS` banner.

To finish the AC, add **20 real JP sake-bottle-label photos**:

1. **Get 20 photos of sake bottle labels.** Cleanest source: photograph
   bottles you own (you hold the copyright in your own photo outright).
   Public-domain / CC-licensed product shots are also fine if the licence
   genuinely permits this use.
   - **Bottle labels ONLY. Never a person / face** — CLAUDE.md's Art. 9
     "no special-category / biometric data" rule. The scan flow is bottle
     labels, full stop.
2. **Drop each file into `photos/`.** Supported extensions: `.jpg`, `.jpeg`,
   `.png`, `.webp`. Pick a readable filename, e.g. `dassai.jpg`.
3. **Add a matching entry to `ground-truth.json`**, keyed by the exact
   filename (see the convention below). Fill `name_ja`, `brewery_ja`, and the
   `provenance` block, and set `provenance.rightsCleared: true` only once the
   rights actually exist.
4. **Re-run** `pnpm eval label-scan-jp`. The `DEGRADED` banner disappears at
   20 rights-cleared real photos.

The two `PLACEHOLDER-*` entries already in `ground-truth.json` are copy-paste
templates — they reference no file and are marked `rightsCleared: false`, so
the runner skips them. Delete them once you have real entries.

---

## Filename / JSON convention

`ground-truth.json` is a flat map from **photo filename → expected answer +
provenance**:

```jsonc
{
  "dassai.jpg": {
    "name_ja": "獺祭",           // brand (銘柄), original script, SKU modifiers stripped
    "brewery_ja": "旭酒造",       // brewery, original script, legal-form suffixes stripped
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
- The shape is validated by `schemas.ts` (`GroundTruthFileSchema`) at start-up.
  A malformed entry crashes with a readable Zod error rather than a silent
  metric miscalculation.

### Photo provenance / rights documentation requirements

Every entry's `provenance.source` is drawn from a closed enum
(`PhotoRightsSourceSchema` in `schemas.ts`):

| source | meaning | `attribution` |
|--------|---------|---------------|
| `maintainer_own_bottle` | you photographed a bottle you own | optional |
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
  (e.g. `anthropic-haiku-4-5,anthropic-sonnet-4-6`). Optional.
- `LABEL_SCAN_EVAL_THROTTLE_MS` — sleep between real-provider calls
  (default `1000`). Keeps a 20-photo run from bursting the Anthropic API.
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

### Smoke test (no Anthropic credit)

```bash
LABEL_SCAN_EVAL_PROVIDERS=e2e-stub pnpm eval label-scan-jp
```

The `e2e-stub` provider returns a fixed Dassai extraction with no network I/O.
Its ground truth matches verbatim, so the smoke run reports a `1.00` exact
match and proves the whole pipeline (corpus discovery → Blob → `extractLabel`
→ metric → table) works end-to-end.

---

## Adding a candidate provider to the run

Providers are named keys into the vision registry
(`src/lib/ai/vision/registry.ts`): `anthropic-haiku-4-5`,
`anthropic-sonnet-4-6`, `e2e-stub`. To compare a new vendor:

1. **Register it.** Add a factory + key to `visionProviderFactories` in the
   registry (that's the vendor-swap seam the whole Phase 3 design protects —
   a new vendor is a registry entry implementing `VisionProvider`, not a
   rewrite). The new key flows into `VISION_PROVIDER_KEYS` automatically.
2. **List it in the run**, either:
   - `LABEL_SCAN_EVAL_PROVIDERS=anthropic-haiku-4-5,<new-key> pnpm eval label-scan-jp`, or
   - create `evals/label-scan-jp/providers.json` — a JSON array of keys, e.g.
     `["anthropic-haiku-4-5", "anthropic-sonnet-4-6"]`. Env wins over the file;
     the file wins over the default (`anthropic-haiku-4-5` alone).
3. **Re-run** and paste the multi-row comparison table into the finetune/
   failover writeup. Unknown keys abort before any paid call.

The runner is strictly serial (one provider, one photo at a time), so adding
providers multiplies runtime by (providers × photos × throttle) — expect a few
minutes for two real providers over 20 photos.

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

If fewer than 20 rights-cleared real photos are present, a `DEGRADED CORPUS`
banner prints above the tables. **Treat the numbers as a wiring check, not a
provider ranking, until the corpus is full.**

---

## Files

- `ground-truth.json` — filename → `{ name_ja, brewery_ja, provenance }`.
- `schemas.ts` — Zod shapes the ground-truth file is parsed against.
- `levenshtein.ts` / `levenshtein.test.ts` — the metric math + its unit test.
- `photos/` — **maintainer drops real photos here** (empty today).
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
