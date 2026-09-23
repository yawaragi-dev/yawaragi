import 'server-only'

import { generateObject, generateText } from 'ai'
import type { TelemetryOptions } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import type { PropagateAttributesParams } from '@langfuse/tracing'

import { env } from '@/env'

type GenerateTextArgs = Parameters<typeof generateText>[0]
type GenerateTextReturn = ReturnType<typeof generateText>
type GenerateObjectArgs = Parameters<typeof generateObject>[0]
type GenerateObjectReturn = ReturnType<typeof generateObject>

/**
 * Phase 4 / S4 (#141): the first Langfuse-traced surface in the repo.
 *
 * Every paid AI SDK call in Yawaragi flows through `tracedGenerateText`
 * / `tracedGenerateObject`. They are *thin* wrappers — they don't
 * spy on the Langfuse SDK or build their own trace payloads.
 *
 * ## How tracing reaches Langfuse (AI SDK 7)
 *
 * AI SDK 6 instrumented itself with OpenTelemetry directly: setting
 * `experimental_telemetry.isEnabled` made the SDK open spans, and
 * `LangfuseSpanProcessor` exported them. **AI SDK 7 removed the
 * OpenTelemetry dependency entirely** — `ai@7` ships zero OTel code and
 * instead exposes a callback-based `Telemetry` integration interface
 * plus a `registerTelemetry()` global registry.
 *
 * So the span-producing layer moved out of `ai` and into
 * `@langfuse/vercel-ai-sdk`'s `LangfuseVercelAiSdkIntegration`, which is
 * registered once at cold start in `otel-setup.ts`. Without that
 * registration **no telemetry is emitted at all**, regardless of what
 * this module passes — the registration is the load-bearing piece, and
 * `isEnabled: true` below only guards against a caller opting out.
 *
 * ## How trace identity survived the migration
 *
 * AI SDK 7's `TelemetryOptions` dropped the flat `metadata` bag that
 * AI SDK 6's `TelemetrySettings` carried. The replacement is Langfuse's
 * `propagateAttributes()` (from `@langfuse/tracing`), which stashes
 * trace-level attributes — `traceName`, `metadata`, and optionally
 * `userId` / `sessionId` / `tags` — in the active OpenTelemetry context.
 * Every Langfuse observation created inside the callback inherits them.
 * `TracedCallContext` is unchanged from the caller's point of view;
 * only the mechanism underneath moved. See ADR-0021 for the full
 * decision record.
 *
 * The wrapper's job is therefore:
 *
 *   1. Force `telemetry.isEnabled = true` on every call, so nobody can
 *      ship an untraced AI SDK call by accident.
 *   2. Default `recordInputs` / `recordOutputs` to `false`, so raw
 *      prompts and model outputs don't land in traces unless the
 *      caller explicitly opts in. This is the GDPR backstop — ADR-0009
 *      RoPA documents Langfuse as "redacted prompts + completions",
 *      and the only way to make that stick across many call sites is
 *      to bake it into the wrapper. The sole exception is the local-dev
 *      `LANGFUSE_RECORD_IO=1` escape hatch, which `payloadRecordingEnabled()`
 *      refuses to honour in production — so the RoPA promise holds by
 *      construction, not by remembering not to set a variable.
 *   3. Attach a stable `functionId` (AI SDK observation grouping *and*
 *      the Langfuse `traceName`) plus a flat `metadata` bag (model id,
 *      provider key, seed kind, etc.) via `propagateAttributes`.
 *      Callers spell out *what* the call is, not *how* it's traced.
 *   4. Fail loudly at call time if the Langfuse env vars are missing
 *      in production. Local dev / test / e2e can stub the helpers; in
 *      production a missing key means traces silently drop, which is
 *      worse than a crash. Same shape as the `SESSION_COOKIE_SECRET`
 *      runtime-throw pattern in `src/lib/rate-limit/...`.
 *
 * Action-level attributes (anonymous-session id hash, rate-limit
 * budget remaining) belong on the *parent* OTel span the action opens
 * around its critical section. The Langfuse integration creates a
 * *child* span per generate call, which inherits the parent context.
 * So callers wrap their action body in their own
 * `tracer.startActiveSpan('suggest-action', ...)` and the AI calls
 * inside automatically join. The helpers in this module only own the
 * per-AI-call layer; the action layer is the caller's responsibility.
 */

export interface TracedCallContext {
  /**
   * Stable identifier for the call site. Becomes the AI SDK
   * `telemetry.functionId` (observation grouping) *and* the Langfuse
   * `traceName`. Use kebab-case scoping: `scan-extract-label`,
   * `suggest-tool-loop`, etc.
   */
  functionId: string
  /**
   * Flat metadata bag propagated onto every Langfuse observation the
   * call produces (so it's queryable in Langfuse). Use the
   * `<area>.<key>` convention: `provider.key`, `model.id`,
   * `session.hash`, `rate-limit.remaining`.
   *
   * Values are `string` — not `AttributeValue` — because Langfuse's
   * `propagateAttributes` accepts string-valued metadata only and
   * **silently drops non-string values with a console warning**. A
   * compile error at the call site beats a missing attribute in
   * production. Stringify numbers/booleans at the call site. Keep
   * values under 200 characters (Langfuse truncates past that).
   */
  metadata?: Record<string, string>
  /**
   * If true, the raw prompt text lands in Langfuse. Left unset it
   * follows `payloadRecordingEnabled()` — `false` everywhere except a
   * local dev process with `LANGFUSE_RECORD_IO=1`, never production —
   * which matches ADR-0009's "redacted prompts" posture. Set it
   * explicitly only for a call site that has its own reason.
   */
  recordInputs?: boolean
  /**
   * If true, the model's raw output lands in Langfuse. Same defaulting
   * and same reasoning as `recordInputs`.
   */
  recordOutputs?: boolean
}

/**
 * Returns whether the Langfuse env vars are present. Exposed for
 * callers that want to branch on observability (e.g. a debug helper
 * that prints a Langfuse trace URL only when the SDK is actually
 * shipping spans).
 */
export function isLangfuseConfigured(): boolean {
  return Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY)
}

/**
 * Throws if Langfuse env is missing in production. Called from the
 * traced wrappers before they hit the AI SDK. Non-production
 * environments are allowed to no-op so local dev and e2e don't need
 * Langfuse credentials.
 */
function assertLangfuseConfigured(): void {
  if (process.env.NODE_ENV !== 'production') return
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
    throw new Error(
      'Langfuse env vars missing in production. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY (and optionally LANGFUSE_HOST) on Vercel before calling traced AI SDK helpers.',
    )
  }
}

/**
 * Builds the `telemetry` options AI SDK 7 expects. Exported so callers
 * that need to pass telemetry through a deeper boundary (e.g. a vision
 * provider's optional `telemetry` option) can construct the same
 * options without reaching into the AI SDK's type space.
 *
 * Note what is *not* here: `metadata`. AI SDK 7's `TelemetryOptions`
 * has no metadata field — see `buildPropagatedAttributes`, which
 * carries it via the Langfuse OTel context instead.
 */
export function buildTelemetryOptions(ctx: TracedCallContext): TelemetryOptions {
  const recordPayloads = payloadRecordingEnabled()
  return {
    isEnabled: true,
    functionId: ctx.functionId,
    recordInputs: ctx.recordInputs ?? recordPayloads,
    recordOutputs: ctx.recordOutputs ?? recordPayloads,
  }
}

/** Warn at most once per process, so a misconfigured deploy isn't spammy. */
let warnedAboutProductionPayloadRecording = false

/**
 * Whether raw prompts and completions may be recorded into Langfuse.
 *
 * `false` unless `LANGFUSE_RECORD_IO=1`, and **always** `false` in
 * production regardless of the env var. ADR-0009's RoPA commits us to
 * "redacted prompts + completions" in Langfuse; this keeps that true no
 * matter what lands in a production environment, so the promise holds by
 * construction rather than by remembering not to set a variable.
 *
 * Refusing silently (rather than throwing, as `RATE_LIMIT_BYPASS` does)
 * is deliberate: for a privacy control the safe failure is "record
 * nothing", and taking the deploy down would trade a data risk for an
 * availability incident. The one-shot warning stops the operator being
 * misled into thinking it took effect.
 */
function payloadRecordingEnabled(): boolean {
  if (env.LANGFUSE_RECORD_IO !== '1') return false
  if (process.env.NODE_ENV === 'production') {
    if (!warnedAboutProductionPayloadRecording) {
      warnedAboutProductionPayloadRecording = true
      console.warn(
        '[langfuse] LANGFUSE_RECORD_IO=1 ignored on Production — recording raw prompts/completions would contradict ADR-0009 RoPA ("redacted prompts + completions"). Traces keep metadata only.',
      )
    }
    return false
  }
  return true
}

/**
 * Builds the Langfuse trace-level attributes that replace AI SDK 6's
 * `experimental_telemetry.metadata`. `traceName` mirrors `functionId`
 * so a Langfuse trace is still identifiable by call site, and
 * `metadata` carries the caller's flat bag.
 *
 * Exported for the same reason as `buildTelemetryOptions`: a caller
 * that wraps a deeper boundary can reuse the identity mapping instead
 * of re-deriving it.
 */
export function buildPropagatedAttributes(ctx: TracedCallContext): PropagateAttributesParams {
  return {
    traceName: ctx.functionId,
    ...(ctx.metadata === undefined ? {} : { metadata: ctx.metadata }),
  }
}

/**
 * `generateText` with Langfuse tracing enforced. Call sites pass the
 * same args they'd pass to `generateText`, plus a `TracedCallContext`.
 * The wrapper overrides any caller-supplied `telemetry` /
 * `experimental_telemetry` — tracing is non-negotiable.
 *
 * Types pass through `Parameters<>` / `ReturnType<>` and lose AI SDK
 * 7's discriminated-union precision (messages | prompt; tool/output
 * variants). Omit-then-spread on a discriminated union drops the
 * discriminant in TS 5.4+, which forces a cast. Callers cast their
 * result if they need the narrowed shape — generateText's runtime
 * behaviour is unchanged.
 */
export async function tracedGenerateText(
  ctx: TracedCallContext,
  args: GenerateTextArgs,
): Promise<Awaited<GenerateTextReturn>> {
  assertLangfuseConfigured()
  const withTelemetry = {
    ...args,
    telemetry: buildTelemetryOptions(ctx),
    // `experimental_telemetry` is AI SDK 7's deprecated alias for
    // `telemetry`. Blank it so a caller that still sets the old key
    // can't fight the enforced options above.
    experimental_telemetry: undefined,
  } as GenerateTextArgs
  return propagateAttributes(buildPropagatedAttributes(ctx), () => generateText(withTelemetry))
}

/**
 * `generateObject` with Langfuse tracing enforced. Schema-validated
 * output flows through unchanged.
 */
export async function tracedGenerateObject(
  ctx: TracedCallContext,
  args: GenerateObjectArgs,
): Promise<Awaited<GenerateObjectReturn>> {
  assertLangfuseConfigured()
  const withTelemetry = {
    ...args,
    telemetry: buildTelemetryOptions(ctx),
    experimental_telemetry: undefined,
  } as GenerateObjectArgs
  return propagateAttributes(buildPropagatedAttributes(ctx), () => generateObject(withTelemetry))
}
