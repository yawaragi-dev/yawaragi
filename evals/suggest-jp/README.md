# `evals/suggest-jp/` — suggest surface eval harness

Informational eval for the Phase 4 `/[locale]/suggest` surface. Runs
15 fixed queries — a mix of seed-based, bottle-name freeform,
descriptor freeform, and cross-beverage freeform — through the live
suggest server action and scores each against a ground-truth
Sakenowa-brand-id set.

**This is not a test.** No pass/fail; no CI wiring. The output is a
markdown-ish stdout table you paste into a PR body or a model-
comparison writeup.

## Run

```bash
pnpm eval suggest-jp
```

Env requirements — same as production suggest:

- `ANTHROPIC_API_KEY`
- `MCP_SAKENOWA_URL`
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST`
- `SESSION_COOKIE_SECRET` / `IP_HASH_SALT`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`

`RATE_LIMIT_BYPASS=1` is set inside the runner before the env
parses, so the anonymous 3/24h cap does not choke a 15-query run.
The boot-time production guard in `src/instrumentation.ts` still
prevents this from ever shipping to production.

## Files

- `queries.ts` — the 15 seed queries, typed via `QuerySchema`.
- `ground-truth.ts` — expected Sakenowa brand IDs per query.
- `schemas.ts` — Zod shapes both files parse against at load time.
- `metrics.ts` — recall@k (normalized, raw and its ceiling); tests
  in `metrics.test.ts`.

`scripts/eval.ts` dispatches, `scripts/eval-suggest-jp.ts` runs.

## Metric

The headline is **normalized recall@k** (`nr@k`):

`nr@k = |intersect(returned_topK, expected)| / min(k, |expected|)`

- `returned_topK` = the first K brand IDs the suggest action
  returned (in the order the LLM produced them).
- `expected` = the ground-truth brand-id set for that query.

A perfect top k scores **1.0 whatever the size of the answer key**.
That matters because most answer keys hold 8–10 brands while the
list is 3–5 long.

**Raw recall@k** (`r@k = hits / |expected|`, the only number before
#289) is still printed beside it, as `raw / ceiling`. The ceiling is
`min(k, |expected|) / |expected|`, the best raw score that query
allows: a 10-brand key caps raw r@5 at 0.50 no matter how good the
answer. On the current 15 queries a perfect run reaches a mean raw
**r@3 of 0.514** and **r@5 of 0.679**, so the documented raw
baselines below are not "about half right" — read them against that
ceiling. Keep quoting raw r@k when comparing with those older runs;
quote nr@k for everything else.

k = 3 and k = 5 are both reported. The suggest schema caps the
result list at 6, so k=5 already covers most of what a visitor sees.
Means are taken over answered (`ok`) queries, each weighted equally.
The arithmetic lives in `metrics.ts` and is unit-tested in
`metrics.test.ts` — the only part of this eval `pnpm test` runs.

Recall is chosen over precision because a suggest result list is
short (3–6) and there's no single "right" answer for most queries.
An LLM that returns 5 brands where 2 are in a ground-truth set of
8 gets nr@5 = 2/5 = 0.40 (raw 2/8 = 0.25 against a ceiling of 0.625)
— some brands were on-point and others divergent-but-not-wrong.

## Prompt-cache signal

The model is `SUGGEST_MODEL` in `src/lib/suggest/suggest-model.ts`, Haiku 5.5 since 2026-10-12 (cached prefix 6897 tokens, hit ratio 0.80). The numbers below were taken on Haiku 4.5; the mechanism is the same.

The eval output reports `cache read`, `cache write`, and a
`cache hit ratio` per query and in the summary. These are load-
bearing signals if you touch the suggest surface:

- **Haiku 4.5's minimum cacheable prefix is 4096 tokens** (per
  Anthropic docs). Below that, `cache_control` markers are silently
  dropped — no error, no warning.
- The current `SUGGEST_SYSTEM_PROMPT` + tools bundle in
  `src/lib/suggest/suggest-action.ts` is sized to exceed 4096
  tokens (measured ~5087 after the #175/#176 recipe expansion).
- **If you edit the system prompt and shrink it below the
  threshold, caching silently stops working.** The eval will show
  `cache read=0 write=0` across every query and a ~40% cost
  regression.

Post-recipe-refresh baseline (#175/#176 fix, 2026-07-06):
- 72-76% cache hit ratio across the 15-query run (down slightly
  from S7's 77% — topK=30 responses are larger)
- $0.17-0.20/run (vs S7's $0.16, up ~20% for the recall gain)
- Mean raw recall@3 = 0.42, mean raw recall@5 = 0.52-0.54 (raw
  r@k, before #289; ceilings 0.514 and 0.679)

Prior S7 baseline (for reference): mean raw r@3=0.39, r@5=0.46,
$0.16/run, 77% cache hit ratio.

## How ground truth was built

See the header of `ground-truth.ts` for the per-mode methodology.
Short version:

- **Seed** — Euclidean k=8 neighbours from the local mirror. Proxy
  for what `find_similar_sakes` (cosine, in MCP) returns; overlap is
  high because the axis vectors are unit-boxed.
- **Bottle-name freeform** — direct `WHERE name_romaji ILIKE '%X%'
  OR name = '<kanji>'` from the mirror at eval-build time.
- **Descriptor freeform** — top-N brands satisfying the axis
  predicate implied by the phrase (`f1 > 0.5 AND f6 > 0.3 …`).
- **Cross-beverage freeform** — top-N brands whose axes match the
  cross-beverage table row for that descriptor
  (`src/lib/ai/tools/cross-beverage-data.ts`).

## Adding a query

1. Append a `Query` record to the `QUERIES` array in `queries.ts`.
2. Append a matching `GroundTruthEntry` to `GROUND_TRUTH` in
   `ground-truth.ts` — the runner throws at load time if a query
   has no ground-truth entry.
3. For descriptor / cross-beverage queries, run a matching SQL
   probe against the mirror to derive `expectedBrandIds` — commit
   the probe as a comment on the ground-truth entry so a future
   maintainer can re-derive if the mirror shifts.
4. Re-run `pnpm eval suggest-jp` and paste the new table into the
   PR that added the query.

## Adding a model / tool-set variant

The runner has one row — `SUGGEST_MODEL` + `sakenowa-mcp +
mapCrossBeverage`. To compare a model, change `SUGGEST_MODEL`, restart
the dev server and run again; for anything larger:

1. Duplicate `scripts/eval-suggest-jp.ts` (or thread a `variant`
   argument) so the runner can dispatch to a modified
   `suggestAction`-equivalent.
2. Emit one summary row per variant so the delta reads directly.
3. Paste the multi-row summary table into the comparison writeup.

Model variants that change the tool loop's behaviour (e.g. Sonnet
escalation, a stricter tool-set) are the primary reason to run this
eval at all.

## Reading the output

Two tables. The **summary** shows one row per (model, tool-set) —
mean nr@3 / nr@5 (the headline), mean raw r@k beside its ceiling, and
median latency. The **per-query detail** shows the
brand IDs the LLM actually returned per query, so a failure mode
("LLM ignored the Kubota name and returned Dassai") is diagnosable
without spelunking through Langfuse traces. Both are pastable into
GitHub.

## Non-goals

- **Reason-coherence scoring.** The PRD mentions a "small reason
  coherence score sampled on N runs". Not shipped in the MVP
  because it's subjective enough that a maintainer's manual review
  of the per-query detail is more honest than a fabricated
  automated score. If we later find a defensible auto-score
  (embedding-similarity between the reason and the seed's flavor
  chart?), add it here.
- **Multi-turn / conversational eval.** Suggest is single-shot by
  design; a multi-turn eval belongs to a later phase.
- **Pass/fail assertions.** The eval is informational — recall@k
  is a signal, not a gate. CI stays out of this file.

## Compliance

- No Art. 9 special-category data. Queries are bottle names, flavor
  descriptors, and cross-beverage terms only.
- Anthropic + MCP requests carry the eval query text — same
  processing posture as a real visitor request. Langfuse captures
  them (30-day retention per ADR-0009). Do not eval on PII.
