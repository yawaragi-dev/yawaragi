import 'server-only'

import { generateObject, generateText } from 'ai'
import type { TelemetrySettings } from 'ai'
import type { AttributeValue } from '@opentelemetry/api'

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
 * spy on the Langfuse SDK or build their own trace payloads. AI SDK 6
 * emits OpenTelemetry spans when `experimental_telemetry.isEnabled` is
 * true; `LangfuseSpanProcessor` (wired in `otel-setup.ts`) reads those
 * spans and ships them to Langfuse Cloud.
 *
 * The wrapper's job is therefore:
 *
 *   1. Force `experimental_telemetry.isEnabled = true` on every call,
 *      so nobody can ship an untraced AI SDK call by accident.
 *   2. Default `recordInputs` / `recordOutputs` to `false`, so raw
 *      prompts and model outputs don't land in traces unless the
 *      caller explicitly opts in. This is the GDPR backstop — ADR-0009
 *      RoPA documents Langfuse as "redacted prompts + completions",
 *      and the only way to make that stick across many call sites is
 *      to bake it into the wrapper.
 *   3. Attach a stable `functionId` and a flat `metadata` bag of
 *      OpenTelemetry-typed attributes (model id, provider key,
 *      hashed session id, etc.). Callers spell out *what* the call
 *      is, not *how* it's traced.
 *   4. Fail loudly at call time if the Langfuse env vars are missing
 *      in production. Local dev / test / e2e can stub the helpers; in
 *      production a missing key means traces silently drop, which is
 *      worse than a crash. Same shape as the `SESSION_COOKIE_SECRET`
 *      runtime-throw pattern in `src/lib/rate-limit/...`.
 *
 * Action-level attributes (anonymous-session id hash, rate-limit
 * budget remaining) belong on the *parent* OTel span the action
 * opens around its critical section. AI SDK 6's experimental_telemetry
 * creates a *child* span on each generate call, which inherits the
 * parent context. So callers wrap their action body in their own
 * `tracer.startActiveSpan('suggest-action', ...)` and the AI calls
 * inside automatically join. The helpers in this module only own the
 * per-AI-call layer; the action layer is the caller's responsibility.
 */

export interface TracedCallContext {
  /**
   * Stable identifier for the call site. Becomes the Langfuse span
   * name and the OTel attribute `ai.functionId`. Use kebab-case
   * scoping: `scan-extract-label`, `suggest-tool-loop`, etc.
   */
  functionId: string
  /**
   * Flat metadata bag. Keys go straight onto the OTel span as
   * attributes (so they're queryable in Langfuse). Use the
   * `<area>.<key>` convention: `provider.key`, `model.id`,
   * `session.hash`, `rate-limit.remaining`.
   */
  metadata?: Record<string, AttributeValue>
  /**
   * If true, the raw prompt text lands in Langfuse. Defaults to
   * `false` to match ADR-0009's "redacted prompts" posture. Set true
   * only for explicitly-opted-in debug runs.
   */
  recordInputs?: boolean
  /**
   * If true, the model's raw output lands in Langfuse. Defaults to
   * `false` for the same reason.
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
 * Builds the `experimental_telemetry` settings the AI SDK 6 expects.
 * Exported so callers that need to pass telemetry through a deeper
 * boundary (e.g. a vision provider's optional `telemetry` option) can
 * construct the same settings without reaching into the AI SDK's
 * type space.
 */
export function buildTelemetrySettings(ctx: TracedCallContext): TelemetrySettings {
  return {
    isEnabled: true,
    functionId: ctx.functionId,
    metadata: ctx.metadata,
    recordInputs: ctx.recordInputs ?? false,
    recordOutputs: ctx.recordOutputs ?? false,
  }
}

/**
 * `generateText` with Langfuse tracing enforced. Call sites pass the
 * same args they'd pass to `generateText`, plus a `TracedCallContext`.
 * The wrapper overrides any caller-supplied `experimental_telemetry`
 * — tracing is non-negotiable.
 *
 * Types pass through `Parameters<>` / `ReturnType<>` and lose AI SDK
 * 6's discriminated-union precision (messages | prompt; tool/output
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
    experimental_telemetry: buildTelemetrySettings(ctx),
  } as GenerateTextArgs
  return generateText(withTelemetry)
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
    experimental_telemetry: buildTelemetrySettings(ctx),
  } as GenerateObjectArgs
  return generateObject(withTelemetry)
}
