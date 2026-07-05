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

`scripts/eval.ts` dispatches, `scripts/eval-suggest-jp.ts` runs.

## Metric

`recall@k = intersect(returned_topK, expected) / |expected|`

- `returned_topK` = the first K brand IDs the suggest action
  returned (in the order the LLM produced them).
- `expected` = the ground-truth brand-id set for that query.

k = 3 and k = 5 are both reported. The suggest schema caps the
result list at 6, so k=5 already covers most of what a visitor sees.

Recall is chosen over precision because a suggest result list is
short (3–6) and there's no single "right" answer for most queries.
An LLM that returns 5 brands where 2 are in the ground truth set of
8 gets 2/8 = 0.25 — a fair reflection that some brands were on-point
and others were divergent-but-not-wrong.

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

The MVP has one row — `claude-haiku-4-5` + `sakenowa-mcp +
mapCrossBeverage`. To compare a new configuration:

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
mean recall and median latency. The **per-query detail** shows the
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
