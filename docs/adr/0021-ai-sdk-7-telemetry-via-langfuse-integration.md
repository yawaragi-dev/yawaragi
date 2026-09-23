# ADR-0021: AI SDK 7 telemetry rides a Langfuse integration, not self-instrumented OTel spans

## Status

Decided — 2026-09-21

Supersedes the telemetry *mechanism* described in `src/lib/ai/observability/langfuse-trace.ts` and `otel-setup.ts` as of AI SDK 6. Does not change ADR-0009's privacy posture — the redaction defaults and the RoPA entry for Langfuse are unchanged.

## Context

The AI SDK 6 → 7 major bump (#268, blocking dependabot #224) is not a dependency chore. It relocates the boundary between our code and our observability vendor.

**AI SDK 6** instrumented itself with OpenTelemetry. Setting `experimental_telemetry: { isEnabled: true }` on a `generateText` / `generateObject` call made the `ai` package open OTel spans directly, and `LangfuseSpanProcessor` (registered via `@vercel/otel` in `otel-setup.ts`) exported them to Langfuse Cloud. Trace identity travelled in `TelemetrySettings.metadata` — a flat bag of OTel attributes (`seed.kind`, `seed.brandId`, `model.id`, `provider.key`) that made a trace findable in the Langfuse UI.

**AI SDK 7 removed the OpenTelemetry dependency entirely.** `ai@7.0.93` ships zero OTel code (`grep -c opentelemetry node_modules/ai/dist/index.js` → `0`). In its place:

- `TelemetrySettings` was renamed `TelemetryOptions`, and **the `metadata` field was deleted, not renamed.** The remaining fields are `isEnabled`, `recordInputs`, `recordOutputs`, `functionId`, `includeRuntimeContext`, `includeToolsContext`, `integrations`.
- Telemetry is emitted through a callback-based `Telemetry` interface (`onStart`, `onStepStart`, `onLanguageModelCallStart`, `onToolExecutionStart`, …), registered process-globally via `registerTelemetry()` or per-call via `telemetry.integrations`.
- `TelemetryOptions.isEnabled` is documented as "enabled by default **when a telemetry integration is registered**". With no integration registered, nothing is emitted at all.

That last point is the dangerous one. Ported naively — bump the versions, delete the `metadata` field until `tsc` is happy — the build goes green, every test passes, every AI call still works, and **Langfuse receives nothing**. There is no error, no warning, and no failing assertion. The only symptom is an empty dashboard that nobody checks until they need it.

Two candidate replacements for the `metadata` bag exist in AI SDK 7 itself:

1. `runtimeContext` + `telemetry.includeRuntimeContext: { key: true }` — puts the values on the *observation* (per-model-call), and requires enumerating every key at the call site.
2. Nothing else. The `Telemetry` callback surface receives `functionId` but no free-form attribute bag.

Neither reaches the *trace* level, which is where Langfuse's search, filtering, and per-user/session grouping live.

## Decision

**Adopt Langfuse's first-party AI SDK 7 integration, and carry trace identity with `propagateAttributes` rather than an SDK field.**

Three concrete parts:

1. **`registerTelemetry(new LangfuseVercelAiSdkIntegration())` in `otel-setup.ts`**, inside the same "only when `LANGFUSE_*` credentials are present" guard as `registerOTel`. `@langfuse/vercel-ai-sdk` (5.11.0, `peerDependencies: { ai: ">=7.0.0 <8" }`) turns AI SDK 7's lifecycle callbacks into OTel spans; `LangfuseSpanProcessor` still exports them. The span-producing layer simply moved from `ai` into a Langfuse package. This is the load-bearing line — see the tripwire below.

2. **Trace identity travels through `propagateAttributes()` from `@langfuse/tracing`.** `tracedGenerateText` / `tracedGenerateObject` wrap the AI SDK call in `propagateAttributes({ traceName, metadata }, () => generateText(...))`. `traceName` mirrors `functionId`, so a trace is still identifiable by call site; `metadata` carries the caller's flat bag. `propagateAttributes` is pure OpenTelemetry context plumbing (`context.with`), so it is safe to call when no SDK is registered — local dev and CI e2e keep working without Langfuse credentials.

3. **`TracedCallContext.metadata` is typed `Record<string, string>`**, narrowed from `Record<string, AttributeValue>`. Langfuse accepts string-valued propagated metadata only and **drops non-strings with a console warning**. A compile error at the call site beats an attribute that quietly disappears in production — and it immediately caught a real case: `suggest-action.ts` was passing `seed.brandId` as a `number`.

We chose `propagateAttributes` over `runtimeContext` + `includeRuntimeContext` because:

- It sets **trace**-level attributes, which is what the deleted `metadata` bag effectively became in Langfuse's model. `runtimeContext` lands on the observation.
- It is the mechanism Langfuse documents as the v6 `metadata` replacement, so it tracks their roadmap rather than ours.
- It keeps `TracedCallContext` unchanged from the caller's point of view — two paid surfaces (`suggest-tool-loop`, `scan-extract-label`) needed no restructuring.
- It leaves room to grow into `userId` / `sessionId` / `tags` / `version`, which `runtimeContext` cannot express as first-class Langfuse fields.

## The tripwire (load-bearing)

`src/lib/ai/observability/otel-setup.test.ts` asserts that importing `otel-setup` with credentials present calls `registerTelemetry` with a `LangfuseVercelAiSdkIntegration`, and that it calls neither that nor `registerOTel` without credentials. `langfuse-trace.test.ts` asserts that every traced call propagates `{ traceName, metadata }`.

These two tests exist specifically because the failure they guard is silent. Do not delete them to "simplify the mocks" — a green suite with no Langfuse data is the exact outcome this ADR is written to prevent.

## Consequences

**Good**

- Observability survives the major bump with trace identity intact, and gains headroom (`userId`, `sessionId`, `tags`) we did not have.
- The span-producing layer is now maintained by the vendor whose backend consumes it, instead of being an emergent property of two independent packages agreeing on OTel conventions.
- Non-string telemetry values are a compile error rather than a silent drop.
- AI SDK 7's tagged file-data union (`{ type: 'data' | 'url' | 'reference' | 'text' }`) makes the Anthropic-Files-API ban expressible as a single discriminant assertion in the vision test — `{ type: 'reference' }` *is* the forbidden `/v1/files` upload path, and it is now named in the type system rather than inferred from "not a URL".

**Costs / risks**

- Three new first-party Langfuse packages (`@langfuse/vercel-ai-sdk`, `@langfuse/tracing`, plus a bump of `@langfuse/otel` to 5.11.0). Same vendor, same DPA, no new data flows — but more surface that must stay version-aligned with `ai`.
- `@langfuse/vercel-ai-sdk` requires Node ≥ 22. We are on `22.x`, so this is satisfied, but it forecloses dropping to an older runtime.
- Langfuse truncates propagated metadata values at 200 characters. `seed.query` is already bounded by `MAX_FREEFORM_QUERY_LEN`, so nothing is at risk today; a future long-text attribute would be silently clipped.
- Span *shape* in Langfuse may differ from AI SDK 6's self-instrumented spans (names, nesting, attribute keys). Saved views or dashboards built against the old shape need re-checking against a preview deploy.

## Privacy (ADR-0009 alignment)

Unchanged. `recordInputs` / `recordOutputs` still default to `false` in the wrapper, so prompts and completions stay redacted unless a call site explicitly opts in. The attributes we propagate are the same ones AI SDK 6 already sent (`seed.kind`, `seed.brandId`, `seed.query`, `model.id`, `provider.key`) — no new personal-data category, no new vendor, no new lawful basis. Langfuse's 30-day trace retention and existing DPA continue to cover it. The `asBaggage` option on `propagateAttributes` (which would put attribute values into outbound HTTP headers) is **not** enabled.
