/**
 * Phase 4 / S7 (#145) — `pnpm eval suggest-jp` runner.
 *
 * Drives the live `/[locale]/suggest` code path via the
 * `/api/debug/eval-suggest` bearer-authed HTTP endpoint against a
 * locally running dev server. Serial loop, one query at a time.
 *
 * # Env required
 *
 * - `CRON_SECRET` — bearer for the debug endpoint. Same secret the
 *   cron routes use; no new provisioning.
 * - `EVAL_BASE_URL` (optional, default `http://localhost:3000`) —
 *   where the dev server is listening. Override to `http://localhost:3001`
 *   if the maintainer runs on a non-default port.
 * - The dev server itself needs `ANTHROPIC_API_KEY`,
 *   `MCP_SAKENOWA_URL`, `LANGFUSE_*`, KV bindings, etc. Since we're
 *   hitting it via HTTP, its env, not the runner's, is what matters.
 * - The dev server SHOULD have `RATE_LIMIT_BYPASS=1` in its
 *   `.env.local` — without it, the eval caps at query 4 (3/24h
 *   anonymous limit). The runner surfaces a rate-limited response as
 *   a `rate_limited` status per query so the failure is legible.
 *
 * # Metric
 *
 * `recall@k = |intersect(returned_topK, expected)| / |expected|`
 *
 * # Rate-limit posture
 *
 * The runner is deliberately serial — a `for..of` loop with `await`
 * per query. Anthropic's / MCP's own upstream rate limits are the
 * only ones we might trip; serial dispatch keeps peak QPS at 1.
 * No parallel workers, no `Promise.all` — CLAUDE.md's "no parallel
 * hammering" note.
 */

import { performance } from 'node:perf_hooks'
import { GROUND_TRUTH } from '~/evals/suggest-jp/ground-truth'
import { QUERIES } from '~/evals/suggest-jp/queries'
import { GroundTruthListSchema, QueryListSchema } from '~/evals/suggest-jp/schemas'
import type { SuggestActionState } from '@/lib/suggest/suggest-action-state'

interface QueryResult {
  queryId: string
  latencyMs: number
  returnedBrandIds: number[]
  expectedBrandIds: number[]
  recallAt3: number
  recallAt5: number
  status: 'ok' | 'no_match' | 'rate_limited' | 'error'
  detail?: string
}

const BASE_URL = process.env.EVAL_BASE_URL ?? 'http://localhost:3000'
const CRON_SECRET = process.env.CRON_SECRET

if (!CRON_SECRET) {
  console.error('eval-suggest-jp: CRON_SECRET env var required (bearer for the debug endpoint).')
  process.exit(1)
}

async function main() {
  // Validate the source-of-truth arrays at eval load. A drifting query
  // set (missing id, malformed record) fails HERE with a Zod error,
  // not silently in the metric.
  const queries = QueryListSchema.parse(QUERIES)
  const groundTruth = GroundTruthListSchema.parse(GROUND_TRUTH)

  const groundTruthById = new Map(groundTruth.map((g) => [g.queryId, g]))

  for (const q of queries) {
    if (!groundTruthById.has(q.id)) {
      throw new Error(
        `Query "${q.id}" has no ground-truth entry in ground-truth.ts. Add it before running the eval.`,
      )
    }
  }

  console.log(`# suggest-jp eval — ${new Date().toISOString()}`)
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Model: claude-haiku-4-5`)
  console.log(`Tool set: sakenowa-mcp + mapCrossBeverage`)
  console.log(`Queries: ${queries.length}`)
  console.log(``)

  const results: QueryResult[] = []

  for (const query of queries) {
    const gt = groundTruthById.get(query.id)
    if (!gt) throw new Error(`unreachable: ground truth missing for ${query.id}`)

    const seed =
      query.mode === 'seed'
        ? { kind: 'brand' as const, brandId: query.brandId }
        : { kind: 'freeform' as const, query: query.query }

    process.stdout.write(`  ${query.id.padEnd(32)} ... `)
    const t0 = performance.now()

    try {
      const state = await callSuggestEndpoint(seed)
      const latency = performance.now() - t0

      let returnedBrandIds: number[] = []
      let status: QueryResult['status'] = 'error'
      let detail: string | undefined

      if (state.status === 'ok') {
        returnedBrandIds = state.suggestions.map((s) => s.brandId.value)
        status = state.suggestions.length === 0 ? 'no_match' : 'ok'
      } else if (state.status === 'rate_limited') {
        status = 'rate_limited'
        detail = `retry after ${state.retryAfterSec}s`
      } else {
        status = 'error'
        detail = state.status + ('reason' in state ? `:${state.reason}` : '')
      }

      const recallAt3 = recall(returnedBrandIds.slice(0, 3), gt.expectedBrandIds)
      const recallAt5 = recall(returnedBrandIds.slice(0, 5), gt.expectedBrandIds)

      results.push({
        queryId: query.id,
        latencyMs: Math.round(latency),
        returnedBrandIds,
        expectedBrandIds: gt.expectedBrandIds,
        recallAt3,
        recallAt5,
        status,
        detail,
      })

      const marker =
        status === 'ok'
          ? 'OK '
          : status === 'no_match'
            ? '∅  '
            : status === 'rate_limited'
              ? 'RL '
              : 'ERR'
      console.log(
        `${marker} r@3=${recallAt3.toFixed(2)}  r@5=${recallAt5.toFixed(2)}  ${Math.round(latency)}ms${detail ? `  (${detail})` : ''}`,
      )
    } catch (err) {
      const latency = performance.now() - t0
      const message = err instanceof Error ? err.message : String(err)
      results.push({
        queryId: query.id,
        latencyMs: Math.round(latency),
        returnedBrandIds: [],
        expectedBrandIds: gt.expectedBrandIds,
        recallAt3: 0,
        recallAt5: 0,
        status: 'error',
        detail: message,
      })
      console.log(`THROW  ${message}`)
    }
  }

  console.log(``)
  console.log(`## Summary`)
  console.log(``)
  console.log(
    `| model | tool-set | queries | ok | no-match | rate-limited | error | mean r@3 | mean r@5 | median latency (ms) |`,
  )
  console.log(
    `|-------|----------|---------|----|----------|--------------|-------|----------|----------|---------------------|`,
  )

  const ok = results.filter((r) => r.status === 'ok')
  const noMatch = results.filter((r) => r.status === 'no_match').length
  const rateLimited = results.filter((r) => r.status === 'rate_limited').length
  const errored = results.filter((r) => r.status === 'error').length
  const meanRecall3 = ok.length
    ? (ok.reduce((s, r) => s + r.recallAt3, 0) / ok.length).toFixed(3)
    : 'n/a'
  const meanRecall5 = ok.length
    ? (ok.reduce((s, r) => s + r.recallAt5, 0) / ok.length).toFixed(3)
    : 'n/a'
  // Median across successful runs — a rate-limited response has zero
  // meaningful latency (just the round-trip to the KV) and would drag
  // the median down misleadingly.
  const okLatencies = ok.map((r) => r.latencyMs)
  const medianLatency = median(okLatencies.length ? okLatencies : results.map((r) => r.latencyMs))

  console.log(
    `| claude-haiku-4-5 | sakenowa-mcp+mapCrossBeverage | ${queries.length} | ${ok.length} | ${noMatch} | ${rateLimited} | ${errored} | ${meanRecall3} | ${meanRecall5} | ${medianLatency} |`,
  )

  console.log(``)
  console.log(`## Per-query detail`)
  console.log(``)
  console.log(`| query id | status | returned brandIds (top-5) | expected size | r@3 | r@5 | ms |`)
  console.log(`|----------|--------|---------------------------|---------------|-----|-----|-----|`)
  for (const r of results) {
    const returned = r.returnedBrandIds.slice(0, 5).join(', ')
    console.log(
      `| ${r.queryId} | ${r.status}${r.detail ? ` (${r.detail})` : ''} | ${returned || '—'} | ${r.expectedBrandIds.length} | ${r.recallAt3.toFixed(2)} | ${r.recallAt5.toFixed(2)} | ${r.latencyMs} |`,
    )
  }
}

async function callSuggestEndpoint(seed: {
  kind: 'brand' | 'freeform'
  brandId?: number
  query?: string
}): Promise<SuggestActionState> {
  const res = await fetch(`${BASE_URL}/api/debug/eval-suggest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CRON_SECRET}`,
    },
    body: JSON.stringify(seed),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`endpoint ${res.status}: ${text}`)
  }
  return (await res.json()) as SuggestActionState
}

function recall(returned: number[], expected: readonly number[]): number {
  if (expected.length === 0) return 0
  const expectedSet = new Set(expected)
  let hit = 0
  for (const id of returned) if (expectedSet.has(id)) hit++
  return hit / expected.length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

main().catch((err) => {
  console.error('eval-suggest-jp: fatal error', err)
  process.exit(1)
})
