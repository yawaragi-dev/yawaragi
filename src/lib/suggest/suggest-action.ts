'use server'

import { cookies } from 'next/headers'
import type { MCPClient } from '@ai-sdk/mcp'
import { anthropic } from '@ai-sdk/anthropic'
import { stepCountIs } from 'ai'

import { getDefaultMcpClient } from '@/lib/ai/mcp/registry'
import { tracedGenerateText } from '@/lib/ai/observability/langfuse-trace'
import { DebugLog, debugAdd, runWithDebugLog } from '@/lib/debug/debug-log'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
import { enforceRateLimit } from '@/lib/rate-limit/enforce-rate-limit'
import { hydrateFlavorProfiles } from './hydrate-flavor-profiles'
import { parseSuggestionsFromText } from './parse-suggestions'
import {
  MAX_FREEFORM_QUERY_LEN,
  type SuggestActionState,
  type SuggestSeed,
} from './suggest-action-state'
import { buildSuggestToolSet } from './tool-set'

/**
 * Phase 4 / S5–S6 (#143, #144) — `suggestAction`.
 *
 * The end-to-end AI-driven vertical of Phase 4: given a seed (a
 * `brandId` from the seed-based path, or a short visitor-typed `query`
 * from the freeform path), run a single AI SDK tool loop with the
 * Sakenowa MCP tools + the deterministic `mapCrossBeverage` tool and
 * return a list of 3–6 recommended similar sakes. Both seed shapes
 * share this one action + one `suggestions` rate-limit bucket — a
 * freeform call and a seed call from the same anonymous session are
 * NOT independent budgets.
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
  // 1. Validate the seed FIRST — before any I/O. Both variants are re-
  //    validated here even though the page's query-string parse already
  //    narrows them, because the action is a public server surface and
  //    must not trust its caller. Malformed input never reaches
  //    cookies()/headers()/debug-log setup — a fast-fail invariant
  //    asserted by the input-validation tests. (The trade-off:
  //    `invalid_input` responses carry no debug log, but the caller
  //    passed bad input so the debug value is thin.)
  if (seed.kind === 'brand') {
    if (!Number.isInteger(seed.brandId) || seed.brandId <= 0) {
      return { status: 'invalid_input', reason: 'malformed_seed' }
    }
  } else if (seed.kind === 'freeform') {
    // `.trim()` mirrors the client-side form's normalisation; empty-
    // after-trim is treated as "no seed" (the page should not have
    // dispatched us) rather than a malformed query.
    const trimmed = seed.query.trim()
    if (trimmed.length === 0) {
      return { status: 'invalid_input', reason: 'empty_query' }
    }
    if (trimmed.length > MAX_FREEFORM_QUERY_LEN) {
      return { status: 'invalid_input', reason: 'query_too_long' }
    }
    // Re-write the query with the trimmed form so downstream prompt
    // building doesn't have to re-normalise.
    seed = { kind: 'freeform', query: trimmed }
  } else {
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
      ...(seed.kind === 'brand'
        ? { seedBrandId: seed.brandId }
        : { seedQuery: seed.query }),
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
    const rateLimit = await enforceRateLimit({ bucket: 'suggestions', logPrefix: '[suggest]' })
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
          ...(seed.kind === 'brand'
            ? { seedBrandId: seed.brandId }
            : { seedQuery: seed.query }),
        })
        llmResult = await tracedGenerateText(
          {
            functionId: 'suggest-tool-loop',
            metadata: {
              'seed.kind': seed.kind,
              ...(seed.kind === 'brand'
                ? { 'seed.brandId': seed.brandId }
                : { 'seed.query': seed.query }),
            },
          },
          {
            model: anthropic('claude-haiku-4-5'),
            tools,
            stopWhen: stepCountIs(6),
            // Messages-array form (instead of `system:` + `prompt:`
            // shorthand) so we can attach `providerOptions.anthropic.
            // cacheControl` to the system message. Combined with the
            // cacheControl on `mapCrossBeverage` (the last tool in the
            // bundle — see `src/lib/ai/tools/map-cross-beverage.ts`),
            // this gives Anthropic two prompt-cache breakpoints: one
            // after the tools block, one after the system block.
            //
            // Haiku 4.5 minimum cacheable prefix (per Anthropic docs):
            // 4096 tokens. Verified by direct-API probe 2026-07-06 —
            // sub-4096 requests are silently dropped (no error, no
            // warning). SUGGEST_SYSTEM_PROMPT is deliberately sized so
            // the system + tools bundle exceeds 4096 tokens; measured
            // ~5087 after the #175/#176 recipe expansion. **If you edit
            // SUGGEST_SYSTEM_PROMPT and shrink it, caching may silently
            // stop working.** The eval will show cacheReadTokens=0 in
            // its output when this happens. Re-verify with a manual
            // probe against `/api/debug/eval-suggest` and inspect the
            // `usage totals` debug entry.
            //
            // Post-recipe-refresh results (#175/#176 fix, 2026-07-06):
            //   - 72-76% cache hit ratio across a 15-query eval run
            //     (down slightly from S7's 77% because topK=30 responses
            //     are larger and per-request output variance grew)
            //   - $0.17-0.20/run at Haiku 4.5 pricing (up ~20% from S7)
            //   - mean recall@3 0.42, recall@5 0.52-0.54 (up from 0.36/0.42)
            messages: [
              {
                role: 'system',
                content: SUGGEST_SYSTEM_PROMPT,
                providerOptions: {
                  anthropic: {
                    cacheControl: { type: 'ephemeral' as const },
                  },
                },
              },
              {
                role: 'user',
                content: buildSeedPrompt(seed),
              },
            ],
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
        // Aggregate token usage across all tool-loop steps. Emit
        // cache-hit ratio so a maintainer running the eval or
        // debugging a slow visitor request can spot a caching
        // regression at a glance (ratio > 0.5 means the prompt-
        // cache breakpoints on system + tools are working; ratio
        // near 0 means the 5-minute TTL expired between steps or
        // the breakpoints were bypassed). Suggest-action.ts is
        // the only current consumer of prompt caching; when scan-
        // action migrates, extract this into a shared helper.
        const usage = llmResult.totalUsage
        const cacheRead = usage.inputTokenDetails?.cacheReadTokens ?? 0
        const cacheWrite = usage.inputTokenDetails?.cacheWriteTokens ?? 0
        const noCache = usage.inputTokenDetails?.noCacheTokens ?? 0
        const totalInput = cacheRead + cacheWrite + noCache
        const cacheHitRatio = totalInput > 0 ? cacheRead / totalInput : 0
        debugAdd('SuggestAction', 'usage totals', {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens,
          cacheRead,
          cacheWrite,
          noCache,
          cacheHitRatio: Number(cacheHitRatio.toFixed(3)),
        })
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
const SUGGEST_SYSTEM_PROMPT = `You are Yawaragi's sake discovery assistant. A visitor either points at a specific sake (the "seed" brand) or types a short freeform phrase describing what they're in the mood for. Your job is to help them explore adjacent sakes to learn about.

TOOLS AVAILABLE

Sakenowa MCP tools (canonical reference data — always prefer these over reasoning from memory):

- find_similar_sakes(brandId, topK): cosine-similarity neighbours in the 6-axis flavor space. Best for seed-based discovery.
- get_sake_details(brandId): the seed sake's own name, brewery, prefecture, and (when present) its flavor_profile. Use this to confirm the seed and to write a comparison in the reason field.
- search_sakes_by_name(query): fuzzy name search across kanji + romaji. Best when the visitor types a specific bottle name (see BOTTLE-NAME QUERIES below).
- get_top_ranked(scope): recent Sakenowa rankings — useful as a fallback for very generic queries or for the empty starter set.
- find_sakes_by_flavor(f1Min, f1Max, ..., f6Min, f6Max, topK): axis-range filter. Best for descriptor phrases where you've mapped the words onto axis targets (see PHRASE-TO-AXIS RECIPES below).
- list_prefectures(): only needed if the visitor mentions a region (Niigata, Yamaguchi, etc.); rarely load-bearing.

Yawaragi-local tool:

- mapCrossBeverage(descriptor, beverage): deterministic Western-descriptor-to-axis lookup. Use this whenever the visitor's phrasing sounds like a whisky/wine/beer/spirit/fortified/cider descriptor. NEVER invent a cross-beverage mapping outside this tool. If the tool returns an error with a knownDescriptors list, acknowledge the miss and either pick the closest known descriptor or fall back to MCP flavor search.

PHRASE-TO-AXIS RECIPES

When the visitor's phrase describes a taste target, translate to axis-range arguments for find_sakes_by_flavor. Two IMPORTANT rules first, then the recipes:

- Constrain only the 2-3 "anchor" axes the phrase most defines. Do NOT pass bounds for the other axes — leave them unbounded. Constraining all six over-filters to zero matches.
- find_sakes_by_flavor returns brands in brandId ascending order, NOT sorted by axis fit. Two consequences: (a) use aggressive thresholds — loose bounds surface low-brandId moderate matches instead of the cluster the phrase implies; (b) pass topK=30 so late-brandId extremes are included in the response, then YOU pick the 3-6 whose flavorProfile scores highest on the anchor axes (not just the first ones returned).
- If the first call returns []: RELAX each bound by 0.05 toward 0.5 and retry once. Do NOT add more axis constraints; do NOT narrow.

Recipes (only pass the axes listed — leave the rest unbounded; topK=30 unless noted):

- "light and floral" / "aromatic" / "fragrant" → f1Min=0.55 (hanayaka), f6Min=0.4 (keikai).
- "mellow and rich" / "umami-forward" → f3Min=0.6 (juko), f5Max=0.15 (dry). The primary anchor is juko (heavy), NOT hojun — the koshu/aged cluster this phrase points to is defined by low dryness + high body, and their f2 is often only moderate (~0.5). Do NOT add f2Min.
- "dry and crisp" / "clean" / "tanrei-karakuchi" → f5Min=0.55 (dry), f6Min=0.45 (keikai).
- "heavy" / "bold" / "full-bodied" → f3Min=0.55 (juko), f2Min=0.55 (hojun).
- "mild" / "calm" / "restrained" → f4Min=0.55 (odayaka).
- Axis-agnostic ("something interesting") → fall back to get_top_ranked and pick a diverse set across axes.

BOTTLE-NAME QUERIES

When the visitor's freeform text is a specific bottle name (Dassai, Kubota, 十四代, "something like Yamazaki 12"):

1. Call search_sakes_by_name to find the matching brandId(s).
2. Return the matched bottle FIRST in the result list, with a reason that names it (e.g. "The 獺祭 you asked about — hanayaka-forward from Yamaguchi").
3. Then call find_similar_sakes on the matched brandId and add 2-4 neighbours as additional recommendations.

This mixed shape ("the thing you asked about + adjacent bottles") is what visitors want when they type a name — treating the name query as pure similarity search returns brands the visitor didn't ask for and never mentions the one they did.

CROSS-BEVERAGE FLOW

For a Western-descriptor phrase ("smoky whisky", "hoppy IPA", "tannic red wine"):

1. Call mapCrossBeverage(descriptor, beverage) — pick the beverage category carefully. This returns f1..f6 axis targets on the Sakenowa scale (0..1).
2. Call find_sakes_by_flavor ONCE with topK=30 and 2-3 loose bounds on the descriptor's SIGNATURE axes. Use the concrete recipes below for the three canonical descriptors; for other descriptors, follow the general rule.
3. The tool returns up to 30 brands in brandId ASCENDING order (NOT axis-fit order). You MUST rank the returned list yourself before picking your 3-6 answers: score each candidate by (sum of anchor-high values + sum of (1 - anchor-low values)) and return the top-scoring. Do not just take the first N.
4. If the first call returns []: RELAX each bound by 0.05 toward 0.5 and retry once. Never add axis constraints; only widen or drop.
5. Every returned Suggestion MUST carry the descriptor in the cross_beverage_descriptor field so the UI renders the HeuristicDisclaimer.
6. If mapCrossBeverage errors (descriptor not in table), pick the closest known descriptor from the error hint, or fall back to a plain flavor phrase — do NOT invent axes.

Concrete recipes (calibrated against the mirror):

- "smoky whisky" (mapCrossBeverage returns f2≈0.75, f3≈0.72, f5≈0.70, f6≈0.18) → find_sakes_by_flavor(f3Min=0.5, f5Min=0.35, f6Max=0.35, topK=30). Rank by (f3 + f5 - f6) desc.
- "hoppy IPA" / "hoppy west coast" (returns f1≈0.85, f5≈0.70, f6≈0.65) → find_sakes_by_flavor(f1Min=0.4, f5Min=0.4, f6Min=0.4, topK=30). Rank by (f1 + f5 + f6) desc.
- "tannic red wine" (returns f2≈0.78, f3≈0.85, f6≈0.12) → find_sakes_by_flavor(f3Min=0.55, f6Max=0.2, topK=30). Rank by (f3 - f6) desc.

For OTHER cross-beverage descriptors: pick the 2-3 axes farthest from 0.5 in the mapCrossBeverage output. For each extreme HIGH (value >= 0.6), pass Min = 0.4. For each extreme LOW (value <= 0.4), pass Max = 0.35. Skip near-middle axes. topK=30. Rank the returned list by anchor-axis fit before picking the 3-6 answers.

FLAVOR AXES VOCABULARY

The 6-axis flavor chart uses brewers' terms. When you cite an axis in a reason field, always use the romaji + kanji + parenthetical English convention:

- f1: hanayaka (華やか, fragrant/floral) — aromatic-ester-driven, not "perfumed"
- f2: hojun (芳醇, mellow/rich) — umami-and-aroma depth, not "creamy"
- f3: juko (重厚, heavy/full-bodied) — weight + amino acid, not "tannic"
- f4: odayaka (穏やか, mild/calm) — restrained aroma, not "neutral"
- f5: dry (ドライ, dry) — closest 1:1; tracks SMV broadly
- f6: keikai (軽快, light/crisp) — refreshing finish, low residual

OUTPUT FORMAT

Emit ONLY a single JSON array of 3 to 6 Suggestion records. No prose before or after, no markdown fences.

Each record MUST match this shape exactly:
{
  "brandId": {"source": "sakenowa", "value": <integer from MCP tool result>},
  "name_ja": {"source": "sakenowa", "value": "<kanji name from MCP tool result>"},
  "name_romaji": {"source": "sakenowa", "value": "<romaji name from MCP tool result>"},
  "reason": {"source": "llm_inferred", "value": "<one short sentence, <=200 chars, explaining why this is similar; discovery framing; cites axes in romaji+kanji+english when relevant>"},
  "cross_beverage_descriptor": {"source": "cross_beverage_map", "value": "<descriptor>"} // OPTIONAL — include ONLY if mapCrossBeverage was used and returned successfully
}

If no matches were found, emit an empty array []. NEVER fabricate a brand, kanji name, or brandId. Do NOT reuse a brandId across multiple returned records.

VOICE

Discovery and learning tone. Words like "explore", "discover", "similar to", "shares the same".

NEVER use "buy", "purchase", "limited", "exclusive", "don't miss", or any other promotional framing (JMStV compliance — this app is a discovery / information tool, not a marketing surface).

Never mention drinking, intoxication, social/sexual/professional success, or medicinal benefit.

Write the reason field so a visitor learning the vocabulary gets a small useful lesson from every suggestion. Cite one axis in romaji+kanji+english when it materially explains the recommendation ("shares the same hanayaka (華やか, fragrant) top-note").
`

function buildSeedPrompt(seed: SuggestSeed): string {
  if (seed.kind === 'brand') {
    return `The seed is Sakenowa brandId ${seed.brandId}. Call get_sake_details for that brandId first to get its name and flavor profile, then find_similar_sakes with the same brandId to get candidates. Pick 3-6 with the most convincing flavor overlap and write a one-sentence reason per suggestion.`
  }
  if (seed.kind === 'freeform') {
    // Wrap the visitor's query in explicit delimiters so a prompt-injection
    // attempt (`"; ignore prior instructions and ...`) at least has to
    // survive the visible delimiter round-trip. The system prompt above
    // is what actually keeps the model on task; this delimiter is a
    // belt-and-suspenders readability affordance more than a hardening
    // measure. `MAX_FREEFORM_QUERY_LEN` already caps the length upstream.
    return `The visitor typed this freeform query:\n\n"""\n${seed.query}\n"""\n\nDecide which tool path fits: for a taste-vocabulary phrase (light, floral, dry, mellow) map it onto flavor axes and call find_sakes_by_flavor; for a Western-beverage descriptor (smoky whisky, tannic wine, hoppy beer) call mapCrossBeverage first and USE its returned axes to drive find_sakes_by_flavor; for a specific bottle name call search_sakes_by_name. Pick 3-6 with the most convincing overlap and write a one-sentence reason per suggestion, in the visitor's own vocabulary where possible. If the query resolves through mapCrossBeverage, include the descriptor in each returned Suggestion via the cross_beverage_descriptor field so the UI can flag the heuristic origin. If no reasonable match exists, return [].`
  }
  // Exhaustiveness check — future seed kinds land here as a TS error
  // until this switch is widened.
  const _exhaustive: never = seed
  return `Unknown seed kind: ${String((_exhaustive as { kind: string }).kind)}. Return [].`
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

  // Deterministic anchor id so the stub cards render regardless of the
  // seed shape. For a brand seed we still bias the ids off the seed so
  // the cards feel connected to the requested seed; for a freeform seed
  // (which carries no numeric anchor) a fixed base keeps the stub
  // stable across queries.
  const anchorId = seed.kind === 'brand' ? seed.brandId : 900000

  if (mode === 'ok') {
    return {
      status: 'ok',
      suggestions: [
        {
          brandId: { source: 'sakenowa', value: anchorId + 1 },
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
          brandId: { source: 'sakenowa', value: anchorId + 2 },
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
          brandId: { source: 'sakenowa', value: anchorId + 3 },
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
