'use server'

import { cookies, headers } from 'next/headers'
import type { MCPClient } from '@ai-sdk/mcp'
import { anthropic } from '@ai-sdk/anthropic'
import { stepCountIs } from 'ai'

import { env } from '@/env'
import { getDefaultMcpClient } from '@/lib/ai/mcp/registry'
import { tracedGenerateText } from '@/lib/ai/observability/langfuse-trace'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { readAnonymousSessionCookie } from '@/lib/legal/anonymous-session-cookie'
import { anonymousRateLimit } from '@/lib/rate-limit/anonymous-rate-limit'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { extractIp, hashIp } from '@/lib/rate-limit/ip-hash'
import { UpstashKVClient } from '@/lib/rate-limit/upstash-kv-client'
import { hydrateFlavorProfiles } from './hydrate-flavor-profiles'
import { parseSuggestionsFromText } from './parse-suggestions'
import type { SuggestActionState, SuggestSeed } from './suggest-action-state'
import { buildSuggestToolSet } from './tool-set'

/**
 * Phase 4 / S5 (#143) — `suggestAction`.
 *
 * The first end-to-end AI-driven vertical of Phase 4: given a seed
 * (currently only a `brandId`), run a single AI SDK tool loop with the
 * Sakenowa MCP tools + the deterministic `mapCrossBeverage` tool and
 * return a list of 3–6 recommended similar sakes.
 *
 * Contrasts with `scan-action.ts`:
 *
 *   - No two-tier retry / model fallback. Suggest is single-loop:
 *     Haiku-with-tools does the whole job. A tier-2 escalate is a
 *     Phase-4-later slice, not S5.
 *   - No image/blob input. Seed is a small JSON payload from the caller;
 *     no ZDR concerns beyond the general "inline base64 only" rule (which
 *     doesn't apply — text-only messages).
 *   - Rate-limit bucket is `suggestions` (3 calls / 24h — 40% of vision-
 *     scan's cap because a suggest call fans out to several MCP tool
 *     invocations under the LLM's control).
 *
 * ADR-0009 GDPR posture: this action collects no new personal data. The
 * `yawaragi_session` cookie is the same anonymous-session cookie the scan
 * action uses (RoPA row already covers it); the hashed IP is a transient
 * KV query key with a 24h TTL and never enters Postgres or a log.
 */
export async function suggestAction(seed: SuggestSeed): Promise<SuggestActionState> {
  // 1. Validate the seed FIRST — before any I/O. `brandId` must be a
  //    positive integer; the page already narrows this on the query-
  //    string parse but the action is a public server surface so it
  //    re-validates. Malformed input never reaches cookies()/headers()/
  //    debug-log setup — a fast-fail invariant asserted by the input
  //    validation tests. (The trade-off: `invalid_input` responses
  //    carry no debug log, but the caller passed bad input so the
  //    debug value is thin.)
  if (
    seed.kind !== 'brand' ||
    !Number.isInteger(seed.brandId) ||
    seed.brandId <= 0
  ) {
    return { status: 'invalid_input', reason: 'malformed_seed' }
  }

  // Read the debug cookie up-front for the RSC-invoked action. When
  // set, every downstream module in the same request participates in
  // the same log via `getCurrentDebugLog()` / `debugAdd(...)` — no
  // parameter threading through helpers, no plumbing changes for
  // future refactors. The response returns the log under `debugLog`
  // so the client `<DebugLogPusher />` island can render it in the
  // panel. When the cookie is absent the log is `undefined` and every
  // `debugAdd(...)` is a cheap no-op — no per-request accumulator
  // overhead.
  const cookieJar = await cookies()
  const log = isDebugEnabledFromCookies(cookieJar) ? new DebugLog() : undefined

  const result = await runWithDebugLog(log, async (): Promise<SuggestActionState> => {
    debugAdd('SuggestAction', 'entered', {
      seedKind: seed.kind,
      seedBrandId: seed.brandId,
    })

    // E2E-stub short-circuit. Non-production only (guard below). Mirrors
    // `VISION_PROVIDER=e2e-stub` for the scan surface: the Playwright spec
    // sets a `yawaragi_suggest_stub` cookie (or the SUGGEST_STUB env var
    // for whole-server override) to exercise the full RSC render path
    // without burning Anthropic credit or requiring a live MCP server.
    // Production fails closed via the guard inside `resolveSuggestStub`.
    const stubbed = await resolveSuggestStub(seed)
    if (stubbed !== null) {
      debugAdd('SuggestAction', 'stub short-circuit fired', {
        status: stubbed.status,
      })
      return stubbed
    }

    // 2. Rate-limit gate. Post-#161 middleware refactor: reads the
    //    `yawaragi_session` cookie the proxy stamped and consults the
    //    `suggestions` bucket. Never mutates the cookie — the proxy is
    //    the sole writer, so this action can safely run mid-render from
    //    the RSC page without hitting Next.js 15's "cookies can only be
    //    modified in a Server Action or Route Handler" guard. Non-prod
    //    without env skips (see scan-action for the same posture).
    const rateLimit = await enforceRateLimit()
    if (rateLimit.kind === 'session_missing') {
      debugAdd('SuggestAction', 'session_missing — cookie absent', undefined, 'warn')
      return { status: 'session_missing' }
    }
    if (!rateLimit.allowed) {
      debugAdd(
        'RateLimit',
        `denied — retry after ${rateLimit.retryAfterSec}s`,
        { retryAfterSec: rateLimit.retryAfterSec },
        'warn',
      )
      return { status: 'rate_limited', retryAfterSec: rateLimit.retryAfterSec }
    }
    debugAdd('RateLimit', 'allowed', { retryAfterSec: rateLimit.retryAfterSec })

    // 3. Open the MCP client. Both the env-missing case (registry factory
    //    throws with a clear "set MCP_SAKENOWA_URL" message) and the
    //    transport-failure case (network / auth against the sakenowa-mcp
    //    HTTP endpoint) surface as `service_unavailable` so the page can
    //    render a specific "temporarily unreachable" copy rather than a
    //    Next error page. Always close in `finally`.
    let client: MCPClient | undefined
    try {
      debugAdd('MCP', 'opening client')
      try {
        client = await getDefaultMcpClient()
      } catch (err) {
        // The registry-thrown message includes "MCP_SAKENOWA_URL" for the
        // unset case; other failures (bad URL, DNS, TLS) also land here.
        // All of them are "service unavailable" from the visitor's POV.
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[suggest] MCP client open failed:', err)
        debugAdd('MCP', 'client open failed', { error: message }, 'error')
        return { status: 'service_unavailable' }
      }
      debugAdd('MCP', `client open — ${client.serverInfo.name}@${client.serverInfo.version}`)

      let mcpTools
      try {
        mcpTools = await client.tools()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[suggest] MCP tools() failed:', err)
        debugAdd('MCP', 'tools() failed', { error: message }, 'error')
        return { status: 'service_unavailable' }
      }
      const mcpToolNames = Object.keys(mcpTools)
      debugAdd('MCP', `${mcpToolNames.length} tools advertised`, {
        tools: mcpToolNames,
      })

      const tools = buildSuggestToolSet(mcpTools)
      debugAdd('SuggestAction', `built tool set (${Object.keys(tools).length} tools)`, {
        tools: Object.keys(tools),
      })

      // 4. One tool loop. The system prompt tells the model to (a) use the
      //    MCP tools for seed-mode discovery, (b) never invent cross-
      //    beverage mappings beyond what `mapCrossBeverage` returns, and
      //    (c) emit the final answer as a JSON array of Suggestion
      //    records. `stepCountIs(6)` bounds the runaway case (a model
      //    stuck in a tool-call loop) — five tool calls plus one final
      //    text emit is more than a well-formed suggest tool loop should
      //    ever need.
      let llmResult
      try {
        debugAdd('SuggestAction', 'starting tool loop', {
          model: 'claude-haiku-4-5',
          seedBrandId: seed.brandId,
        })
        llmResult = await tracedGenerateText(
          {
            functionId: 'suggest-tool-loop',
            metadata: {
              'seed.kind': seed.kind,
              'seed.brandId': seed.brandId,
            },
          },
          {
            model: anthropic('claude-haiku-4-5'),
            tools,
            stopWhen: stepCountIs(6),
            system: SUGGEST_SYSTEM_PROMPT,
            prompt: buildSeedPrompt(seed),
            // Per-step debug affordance (round 6b). Round 5 shipped the
            // milestone-level entries (entered / rate-limit / MCP client
            // open / tool loop start / tool loop returned / hydrate);
            // this callback fills the gap inside the loop by emitting
            // one line per tool call, one per tool result, and one
            // per-step summary. `debugAdd(...)` is a no-op when
            // `getCurrentDebugLog()` is undefined, so this fires on every
            // request but short-circuits for non-debug visitors — the
            // debug-mode branch stays at the log layer, not the LLM-call
            // config shape.
            //
            // No automated test: `MockLanguageModelV3` scripting for a
            // multi-tool sequence would be disproportionate for the
            // signal here (existing suggest-action tests cover the
            // surrounding decision branches). Verified manually via
            // `/en/suggest?seed=<N>` with the `yawaragi_debug=1` cookie
            // and `RATE_LIMIT_BYPASS=1` env — the debug panel shows
            // `tool-call:`, `tool-result:`, and `step complete` lines
            // for each MCP call inside the loop.
            onStepFinish: (step) => {
              for (const call of step.toolCalls) {
                const argsPreview = JSON.stringify(call.input).slice(0, 200)
                debugAdd('SuggestAction', `tool-call: ${call.toolName}(${argsPreview})`)
              }
              for (const result of step.toolResults) {
                const outputPreview = JSON.stringify(result.output).slice(0, 150)
                debugAdd(
                  'SuggestAction',
                  `tool-result: ${result.toolName} → ${outputPreview}`,
                )
              }
              if (step.text && step.text.length > 0) {
                debugAdd(
                  'SuggestAction',
                  `text-generation step (${step.text.length} chars)`,
                )
              }
              debugAdd('SuggestAction', 'step complete', {
                finishReason: step.finishReason,
                usage: step.usage,
              })
            },
          },
        )
        debugAdd('SuggestAction', `tool loop returned (${llmResult.text?.length ?? 0} chars of final text)`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[suggest] tool loop failed:', message)
        debugAdd('SuggestAction', 'tool loop failed', { error: message }, 'error')
        return { status: 'error', reason: 'tool_loop_failed' }
      }

      // 5. Parse the model's final text into a Suggestion[] via the
      //    field-level provenance-pinned schema. An empty list is the
      //    honest no-match outcome — the page renders the noMatch copy
      //    instead of a card list. NEVER fabricate a card.
      let suggestions
      try {
        suggestions = parseSuggestionsFromText(llmResult.text ?? '')
        debugAdd('SuggestAction', `parsed ${suggestions.length} suggestions`, {
          brandIds: suggestions.map((s) => s.brandId.value),
        })
      } catch (err) {
        // parseSuggestionsFromText itself doesn't throw (parses defensively);
        // catch is a belt-and-suspenders against a future refactor.
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[suggest] parse failed:', message)
        debugAdd('SuggestAction', 'parse failed', { error: message }, 'error')
        return { status: 'error', reason: 'parse_failed' }
      }

      // 6. Fan-out `get_sake_details` in parallel to hydrate each card
      //    with its canonical Sakenowa flavor_profile (six axes). The
      //    LLM tool loop above cannot emit axis positions — the schema
      //    pins the source literal to `sakenowa`, so any hallucinated
      //    profile from the LLM would fail parse and get dropped. This
      //    deterministic post-enrichment is the only path axis data
      //    reaches the visible card. Failures are isolated per brand:
      //    a rejected lookup or a null flavorProfile drops the field
      //    from that card only; the rest of the list still renders.
      try {
        debugAdd('Hydrate', `fan-out starting (${suggestions.length} brandIds)`)
        const beforeHydration = suggestions.length
        suggestions = await hydrateFlavorProfiles(suggestions, mcpTools)
        const hydrated = suggestions.filter((s) => s.flavor_profile != null).length
        debugAdd('Hydrate', `fan-out complete — ${hydrated}/${beforeHydration} cards have a flavor profile`)
      } catch (err) {
        // hydrateFlavorProfiles catches per-brand failures internally via
        // Promise.allSettled; this outer catch is belt-and-suspenders
        // against a future refactor that throws before the fan-out.
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[suggest] flavor-profile fan-out failed:', message)
        debugAdd('Hydrate', 'fan-out failed (whole)', { error: message }, 'error')
        // Do NOT fail the action — the LLM's reasoning is still useful.
      }

      debugAdd('SuggestAction', `returning ok with ${suggestions.length} suggestions`)
      return { status: 'ok', suggestions }
    } finally {
      if (client != null) {
        try {
          await client.close()
        } catch {
          // Best-effort close — same pattern as the smoke route.
        }
      }
    }
  })

  return log ? { ...result, debugLog: log.toArray() } : result
}

// -------------------- prompt --------------------

/**
 * The suggest system prompt. Encodes:
 *
 *   - Discovery / learning framing (CLAUDE.md § "Age gate and JMStV
 *     compliance"). No promotional copy. No "buy" or "don't miss".
 *   - Tool-use policy: MCP first for seed-mode discovery.
 *   - The cross-beverage safety rule: NEVER invent a mapping; if the
 *     visitor's phrasing sounds like a cross-beverage descriptor, call
 *     `mapCrossBeverage`; if it errors, tell the truth.
 *   - Output shape: a strict JSON array of 3-6 records matching the
 *     Suggestion schema. Every field is a `{ source, value }` object with
 *     the correct source literal. The parse layer will drop any row that
 *     doesn't validate.
 *   - Empty list is acceptable — the honest no-match outcome.
 *   - Flavor axes: prefer romaji + kanji + parenthetical approximation in
 *     the reason text so the frontend can display the axis label the
 *     visitor learns to recognise (CLAUDE.md § "6-axis flavor
 *     vocabulary" — the FE component renders the label itself, but if the
 *     reason cites an axis it should use the same convention).
 */
const SUGGEST_SYSTEM_PROMPT = `You are Yawaragi's sake discovery assistant. A visitor is looking at a specific sake (the "seed") and wants to discover similar sakes to learn about.

TOOLS
- Use the Sakenowa MCP tools (find_similar_sakes, get_sake_details, search_sakes_by_name, get_top_ranked, find_sakes_by_flavor, list_prefectures) to look up canonical sake data. For a seed brandId, start with find_similar_sakes to get candidates.
- Use mapCrossBeverage ONLY if the visitor's phrasing describes a Western-beverage descriptor (smoky, tannic, hoppy, etc.). NEVER invent a cross-beverage mapping outside this tool — if the tool returns an error, acknowledge it and continue with MCP-based discovery instead. Seed mode does not typically exercise this tool.

FLAVOR AXES
- The 6-axis flavor chart uses brewers' terms: hanayaka (華やか, fragrant/floral), hojun (芳醇, mellow/rich), juko (重厚, heavy/full-bodied), odayaka (穏やか, mild/calm), dry (ドライ), keikai (軽快, light/crisp). If you cite an axis in the reason, use the romaji + kanji + parenthetical English convention.

OUTPUT
- Emit ONLY a single JSON array of 3 to 6 Suggestion records. No prose before or after, no markdown fences.
- Each record MUST match this shape exactly:
  {
    "brandId": {"source": "sakenowa", "value": <integer from MCP tool result>},
    "name_ja": {"source": "sakenowa", "value": "<kanji name from MCP tool result>"},
    "name_romaji": {"source": "sakenowa", "value": "<romaji name from MCP tool result>"},
    "reason": {"source": "llm_inferred", "value": "<one short sentence, <=200 chars, explaining why this is similar; discovery framing>"},
    "cross_beverage_descriptor": {"source": "cross_beverage_map", "value": "<descriptor>"} // OPTIONAL — include ONLY if mapCrossBeverage was used and returned successfully
  }
- If no similar sakes are found, emit an empty array []. NEVER fabricate a brand, kanji name, or brandId.

VOICE
- Discovery and learning tone. Words like "explore", "discover", "similar to", "shares the same". NEVER "buy", "purchase", "limited", "exclusive", "don't miss".
- Never mention drinking, intoxication, social success, or medicinal benefit.
`

function buildSeedPrompt(seed: SuggestSeed): string {
  if (seed.kind === 'brand') {
    return `The seed is Sakenowa brandId ${seed.brandId}. Call get_sake_details for that brandId first to get its name and flavor profile, then find_similar_sakes with the same brandId to get candidates. Pick 3-6 with the most convincing flavor overlap and write a one-sentence reason per suggestion.`
  }
  // Exhaustiveness check — future seed kinds land here as a TS error
  // until this switch is widened.
  const _exhaustive: never = seed.kind
  return `Unknown seed kind: ${String(_exhaustive)}. Return [].`
}

// -------------------- rate-limit helper --------------------

type RateLimitDecision =
  | { kind: 'allowed'; allowed: true; retryAfterSec: number }
  | { kind: 'denied'; allowed: false; retryAfterSec: number }
  | { kind: 'session_missing' }

/**
 * Read-only rate-limit gate. Post-#161 middleware refactor: the proxy
 * (`src/proxy.ts`) is the sole writer of `yawaragi_session`; this
 * function only READS the cookie and consults the `suggestions`
 * bucket. Structurally identical to `scan-action`'s `enforceRateLimit`
 * — the two share the same session cookie and the same env-triplet
 * fail-closed posture; only the bucket name differs.
 *
 * Extracting a shared helper was considered and rejected for this slice:
 * the two actions have different failure envelopes and different
 * downstream side-effects, so the cost of a shared helper (three-arg call
 * shape, discriminated-union return, tests that must cover both callers)
 * outweighs the DRY benefit. A future refactor can consolidate once a
 * third rate-limited action lands.
 */
async function enforceRateLimit(): Promise<RateLimitDecision> {
  // Dev/preview escape hatch (see env.ts `RATE_LIMIT_BYPASS`): skip
  // the KV round-trip and cookie / IP-hash read entirely. Absence of
  // the var is the safe default. Never set on Production Vercel.
  if (env.RATE_LIMIT_BYPASS === '1') {
    console.warn(
      '[suggest] RATE_LIMIT_BYPASS=1 — rate limit skipped. Do NOT ship this in Production.',
    )
    return { kind: 'allowed', allowed: true, retryAfterSec: 0 }
  }
  const config = assertRateLimitConfig(
    {
      secret: env.SESSION_COOKIE_SECRET,
      salt: env.IP_HASH_SALT,
      kvUrl: env.UPSTASH_REDIS_REST_URL,
      kvToken: env.UPSTASH_REDIS_REST_TOKEN,
    },
    process.env.NODE_ENV === 'production',
  )
  if (!config) {
    console.warn(
      '[suggest] rate-limit env not set; skipping enforcement (non-production only).',
    )
    return { kind: 'allowed', allowed: true, retryAfterSec: 0 }
  }
  const { secret, salt, kvUrl, kvToken } = config

  const cookieJar = await cookies()
  const requestHeaders = await headers()

  const session = readAnonymousSessionCookie(cookieJar, secret)
  if (!session) {
    // Middleware is the sole writer post-#161. If we're here without a
    // cookie, the middleware didn't run for this request (matcher gap,
    // direct action invocation from a test, etc.). Surface as a typed
    // state — never throw, never bypass the limiter.
    console.warn(
      '[suggest] session cookie missing — middleware did not stamp it.',
    )
    return { kind: 'session_missing' }
  }

  const ipHashed = hashIp(extractIp(requestHeaders), salt)
  const kv = new UpstashKVClient(kvUrl, kvToken)
  const result = await anonymousRateLimit(
    { cookieId: session.sid, ipHashed, bucket: 'suggestions' },
    { kv },
  )

  return result.allowed
    ? { kind: 'allowed', allowed: true, retryAfterSec: result.retryAfterSec }
    : { kind: 'denied', allowed: false, retryAfterSec: result.retryAfterSec }
}

/**
 * Reads the `yawaragi_suggest_stub` cookie value. The cookie is set
 * client-side by the Playwright spec via `context.addCookies([...])` and
 * carries one of the recognised stub modes (`ok`, `no_match`, etc). No
 * signing / validation — this is a non-production seam only.
 */
async function readSuggestStubCookie(): Promise<string | null> {
  const jar = await cookies()
  return jar.get('yawaragi_suggest_stub')?.value ?? null
}

// -------------------- e2e-stub short-circuit --------------------

/**
 * When `SUGGEST_STUB` is set (non-production only), return a deterministic
 * state without touching MCP / Anthropic / rate-limit. The Playwright spec
 * uses this to exercise the RSC render paths for each `SuggestActionState`
 * variant end-to-end without wiring up a live MCP server or burning LLM
 * credit on every CI run.
 *
 * Values:
 *   - `ok`               — a 3-card list where two cards carry a
 *                          `flavor_profile` (round-2 fan-out coverage —
 *                          the third card is intentionally chart-less so
 *                          the spec can also assert that the axis
 *                          cluster is skipped, not "N/A"-placeholder'd,
 *                          when MCP returns null). Also includes one
 *                          cross-beverage descriptor so the disclaimer
 *                          + attribution + provenance badges all render.
 *   - `no_match`         — an empty ok list, so the noMatch copy renders.
 *   - `rate_limited`     — the rate-limit envelope.
 *   - `service_unavailable` — the MCP-down envelope.
 *   - `error`            — the generic error envelope.
 *
 * Production is fail-closed: even if the env var leaks into a production
 * deploy, the guard below refuses to short-circuit. Same posture as the
 * vision-provider e2e-stub.
 */
async function resolveSuggestStub(seed: SuggestSeed): Promise<SuggestActionState | null> {
  if (process.env.NODE_ENV === 'production') return null
  // Env var wins over cookie; cookie exists so each Playwright browser
  // context can pick its own stub mode without restarting the shared
  // webserver.
  const envMode = process.env.SUGGEST_STUB
  const mode = envMode && envMode !== '' ? envMode : await readSuggestStubCookie()
  if (mode == null || mode === '') return null

  if (mode === 'ok') {
    return {
      status: 'ok',
      suggestions: [
        {
          brandId: { source: 'sakenowa', value: seed.brandId + 1 },
          name_ja: { source: 'sakenowa', value: '獺祭' },
          name_romaji: { source: 'sakenowa', value: 'Dassai' },
          reason: {
            source: 'llm_inferred',
            value:
              'Shares hanayaka (華やか, fragrant) character with a similarly polished rice profile.',
          },
          // Fan-out result — a chart-bearing brand. Axes chosen to
          // read as hanayaka/keikai forward (matches the reason copy)
          // so a maintainer eyeballing the stub state sees an
          // internally-consistent card.
          flavor_profile: {
            source: 'sakenowa',
            f1: 0.72,
            f2: 0.35,
            f3: 0.25,
            f4: 0.45,
            f5: 0.55,
            f6: 0.68,
          },
        },
        {
          brandId: { source: 'sakenowa', value: seed.brandId + 2 },
          name_ja: { source: 'sakenowa', value: '久保田' },
          name_romaji: { source: 'sakenowa', value: 'Kubota' },
          reason: {
            source: 'llm_inferred',
            value: 'Explore a keikai (軽快, light/crisp) finish from a different prefecture.',
          },
          flavor_profile: {
            source: 'sakenowa',
            f1: 0.55,
            f2: 0.4,
            f3: 0.3,
            f4: 0.5,
            f5: 0.6,
            f6: 0.75,
          },
        },
        {
          brandId: { source: 'sakenowa', value: seed.brandId + 3 },
          name_ja: { source: 'sakenowa', value: '八海山' },
          name_romaji: { source: 'sakenowa', value: 'Hakkaisan' },
          reason: {
            source: 'llm_inferred',
            value: 'A comparable odayaka (穏やか, mild) profile with restrained aromatics.',
          },
          // Intentionally NO flavor_profile — this card mirrors the
          // "brand exists in mirror but has no flavor_charts row"
          // case (brand 1 / 新十津川 is the canonical real-world
          // example). The Playwright spec asserts the axis cluster is
          // skipped on this card, not rendered as a placeholder.
          cross_beverage_descriptor: {
            source: 'cross_beverage_map',
            value: 'crisp-lager-like',
          },
        },
      ],
    }
  }
  if (mode === 'no_match') return { status: 'ok', suggestions: [] }
  if (mode === 'rate_limited') {
    return { status: 'rate_limited', retryAfterSec: 60 * 60 * 24 }
  }
  if (mode === 'service_unavailable') {
    return { status: 'service_unavailable' }
  }
  if (mode === 'error') {
    return { status: 'error', reason: 'stub_error' }
  }
  return null
}
