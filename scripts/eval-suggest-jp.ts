/**
 * Phase 4 / S7 (#145) — `pnpm eval suggest-jp` runner.
 *
 * Drives the live `/[locale]/suggest` code path via the
 * `/api/debug/eval-suggest` bearer-authed HTTP endpoint against a
 * locally running dev server. Serial loop, one query at a time.
 *
 * # Env
 *
 * Runner reads:
 *   - `CRON_SECRET` — bearer for the debug endpoint. Same secret
 *     the cron routes use; no new provisioning.
 *   - `EVAL_BASE_URL` (optional, default `http://localhost:3000`)
 *     — where the dev server is listening. Override to
 *     `http://localhost:3001` if the maintainer runs on a non-
 *     default port.
 *
 * Dev server needs (enforced there, not here):
 *   - `ANTHROPIC_API_KEY`, `MCP_SAKENOWA_URL`, `LANGFUSE_*`,
 *     `SESSION_COOKIE_SECRET`, `IP_HASH_SALT`, KV bindings — the
 *     same env `suggestAction` reads in production.
 *   - `RATE_LIMIT_BYPASS=1` — without it, the eval caps at query 4
 *     (3/24h anonymous limit). The runner surfaces a rate-limited
 *     response as a `rate_limited` status per query so the failure
 *     is legible.
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
  // Populated when the endpoint returns a `debugLog` with a
  // `SuggestAction / usage totals` entry (i.e. the `yawaragi_debug=1`
  // cookie was set on the request, which the runner always does).
  // Undefined means the debug capture failed for some reason — the
  // per-query recall still works.
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  cacheHitRatio?: number
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
      const usage = extractUsage(state.debugLog)

      results.push({
        queryId: query.id,
        latencyMs: Math.round(latency),
        returnedBrandIds,
        expectedBrandIds: gt.expectedBrandIds,
        recallAt3,
        recallAt5,
        status,
        detail,
        ...usage,
      })

      const marker =
        status === 'ok'
          ? 'OK '
          : status === 'no_match'
            ? '∅  '
            : status === 'rate_limited'
              ? 'RL '
              : 'ERR'
      const usageSuffix =
        usage.inputTokens != null
          ? `  in=${usage.inputTokens}(read=${usage.cacheReadTokens ?? 0} write=${usage.cacheWriteTokens ?? 0}) out=${usage.outputTokens}`
          : ''
      console.log(
        `${marker} r@3=${recallAt3.toFixed(2)}  r@5=${recallAt5.toFixed(2)}  ${Math.round(latency)}ms${detail ? `  (${detail})` : ''}${usageSuffix}`,
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

  const usageResults = results.filter((r) => r.inputTokens != null)
  if (usageResults.length > 0) {
    const totalInput = usageResults.reduce((s, r) => s + (r.inputTokens ?? 0), 0)
    const totalOutput = usageResults.reduce((s, r) => s + (r.outputTokens ?? 0), 0)
    const totalCacheRead = usageResults.reduce((s, r) => s + (r.cacheReadTokens ?? 0), 0)
    const totalCacheWrite = usageResults.reduce((s, r) => s + (r.cacheWriteTokens ?? 0), 0)
    const totalNoCache = totalInput - totalCacheRead - totalCacheWrite
    const overallHitRatio = totalInput > 0 ? totalCacheRead / totalInput : 0

    // Anthropic Claude Haiku 4.5 pricing (2026-01 cutoff — verify at
    // https://www.anthropic.com/pricing before quoting):
    //   input          $1.00 / MTok
    //   output         $5.00 / MTok
    //   cache write    $1.25 / MTok  (125% of input)
    //   cache read     $0.10 / MTok  (10% of input)
    // The rough-USD column below assumes these; adjust the constants
    // if Anthropic changes the sheet.
    const RATE_INPUT = 1.0
    const RATE_OUTPUT = 5.0
    const RATE_CACHE_WRITE = 1.25
    const RATE_CACHE_READ = 0.1
    const costUsd =
      (totalNoCache * RATE_INPUT +
        totalCacheWrite * RATE_CACHE_WRITE +
        totalCacheRead * RATE_CACHE_READ +
        totalOutput * RATE_OUTPUT) /
      1_000_000

    console.log(``)
    console.log(`## Token usage + cost`)
    console.log(``)
    console.log(
      `| queries | input | output | cache read | cache write | no-cache input | cache hit ratio | est. USD (Haiku 4.5) |`,
    )
    console.log(
      `|---------|-------|--------|------------|-------------|----------------|-----------------|-----------------------|`,
    )
    console.log(
      `| ${usageResults.length} | ${totalInput} | ${totalOutput} | ${totalCacheRead} | ${totalCacheWrite} | ${totalNoCache} | ${overallHitRatio.toFixed(3)} | $${costUsd.toFixed(4)} |`,
    )
  }

  console.log(``)
  console.log(`## Per-query detail`)
  console.log(``)
  console.log(`| query id | status | returned brandIds (top-5) | expected size | r@3 | r@5 | ms | in | out | cache read |`)
  console.log(`|----------|--------|---------------------------|---------------|-----|-----|-----|-----|-----|------------|`)
  for (const r of results) {
    const returned = r.returnedBrandIds.slice(0, 5).join(', ')
    const inTok = r.inputTokens != null ? String(r.inputTokens) : '—'
    const outTok = r.outputTokens != null ? String(r.outputTokens) : '—'
    const cacheRead = r.cacheReadTokens != null ? String(r.cacheReadTokens) : '—'
    console.log(
      `| ${r.queryId} | ${r.status}${r.detail ? ` (${r.detail})` : ''} | ${returned || '—'} | ${r.expectedBrandIds.length} | ${r.recallAt3.toFixed(2)} | ${r.recallAt5.toFixed(2)} | ${r.latencyMs} | ${inTok} | ${outTok} | ${cacheRead} |`,
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
      // `yawaragi_debug=1` opts the request into the DebugLog capture
      // path (see `isDebugEnabledFromCookies`). The runner needs this
      // to extract per-query token usage + cache-hit stats from the
      // `debugLog` array on the response. Zero effect for a non-eval
      // visitor (this endpoint is dev-only anyway).
      Cookie: 'yawaragi_debug=1',
    },
    body: JSON.stringify(seed),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>')
    throw new Error(`endpoint ${res.status}: ${text}`)
  }
  return (await res.json()) as SuggestActionState
}

/**
 * Pull the aggregate `usage totals` entry out of a `debugLog` array.
 * Returns undefined if the debug capture didn't happen (missing cookie,
 * `debugLog` field absent, no matching entry). The eval treats undefined
 * as "no usage data for this query" — recall / latency still work.
 */
function extractUsage(
  debugLog: SuggestActionState['debugLog'],
):
  | Pick<
      QueryResult,
      'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'cacheHitRatio'
    >
  | Record<string, never> {
  if (!debugLog) return {}
  const entry = debugLog.find(
    (e) => e.source === 'SuggestAction' && e.message === 'usage totals',
  )
  if (!entry || !entry.data) return {}
  const d = entry.data as Record<string, unknown>
  return {
    inputTokens: typeof d.input === 'number' ? d.input : undefined,
    outputTokens: typeof d.output === 'number' ? d.output : undefined,
    cacheReadTokens: typeof d.cacheRead === 'number' ? d.cacheRead : undefined,
    cacheWriteTokens: typeof d.cacheWrite === 'number' ? d.cacheWrite : undefined,
    cacheHitRatio: typeof d.cacheHitRatio === 'number' ? d.cacheHitRatio : undefined,
  }
}

function recall(returned: number[], expected: readonly number[]): number {
  if (expected.length === 0) return 0
  const expectedSet = new Set(expected)
  // Dedup on the returned side. If the LLM emits the same brandId
  // twice inside the topK (unlikely — the Suggestion schema doesn't
  // enforce uniqueness — but possible for a runaway tool loop),
  // a naive count would double-hit. Recall is defined over the
  // SET intersection, not the multiset, so seenHits gates.
  const seenHits = new Set<number>()
  for (const id of returned) {
    if (expectedSet.has(id)) seenHits.add(id)
  }
  return seenHits.size / expected.length
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
