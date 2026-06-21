import 'server-only'

import { registerOTel } from '@vercel/otel'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { env } from '@/env'

/**
 * Side-effect module: registers the OpenTelemetry SDK and wires the
 * Langfuse span processor as one of its exporters. Called once from
 * `src/instrumentation.ts` during Next.js cold start.
 *
 * Architectural decisions:
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
}
