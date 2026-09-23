import 'server-only'

import { registerTelemetry } from 'ai'
import { registerOTel } from '@vercel/otel'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { LangfuseVercelAiSdkIntegration } from '@langfuse/vercel-ai-sdk'
import { env } from '@/env'

/**
 * Side-effect module: registers the OpenTelemetry SDK, wires the
 * Langfuse span processor as one of its exporters, and registers the
 * Langfuse AI SDK telemetry integration. Called once from
 * `src/instrumentation.ts` during Next.js cold start.
 *
 * Architectural decisions:
 *
 *   - **`registerTelemetry` is mandatory on AI SDK 7.** AI SDK 6
 *     instrumented itself with OpenTelemetry, so a registered span
 *     processor was enough. `ai@7` dropped the OTel dependency entirely
 *     and emits telemetry only through registered `Telemetry`
 *     integrations. `LangfuseVercelAiSdkIntegration` is that
 *     integration: it turns the SDK's lifecycle callbacks into OTel
 *     spans, which `LangfuseSpanProcessor` then exports. Remove this
 *     call and Langfuse goes silent without a single failing test —
 *     which is exactly why `otel-setup.test.ts` pins it. See ADR-0021.
 *
 *   - **`@vercel/otel` over raw `@opentelemetry/sdk-node`**: Vercel's
 *     wrapper preserves Next.js' built-in tracing (request spans,
 *     server-action spans) while letting us attach extra span
 *     processors. Direct `sdk-node` works locally but races with
 *     Vercel's own auto-instrumentation in production.
 *
 *   - **No-op when Langfuse env is missing.** Local dev without
 *     credentials still boots. The runtime guard in
 *     `langfuse-trace.ts` throws at the first traced call site when
 *     env is missing — that's the right place for the "you forgot to
 *     set LANGFUSE_*" failure mode, not here.
 *
 *   - **Env-name mapping.** Our env taxonomy says `LANGFUSE_HOST` (set
 *     since Phase 0 / S10 #54). Langfuse's own SDK reads `baseUrl` /
 *     `LANGFUSE_BASE_URL`. We pass the value explicitly rather than
 *     renaming the env var — keeps Vercel-side environment
 *     configuration stable across the change.
 */

if (env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) {
  registerOTel({
    serviceName: 'yawaragi',
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: env.LANGFUSE_PUBLIC_KEY,
        secretKey: env.LANGFUSE_SECRET_KEY,
        baseUrl: env.LANGFUSE_HOST,
      }),
    ],
  })

  // Order matters only in that both must happen before the first AI SDK
  // call. `registerTelemetry` is additive and process-global; calling it
  // once per cold start matches `registerOTel`'s contract.
  registerTelemetry(new LangfuseVercelAiSdkIntegration())
}
