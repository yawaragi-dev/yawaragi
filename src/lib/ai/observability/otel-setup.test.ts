/**
 * AI SDK 7 migration (#268): guards the one line that keeps Langfuse alive.
 *
 * On AI SDK 6 the `ai` package instrumented itself with OpenTelemetry, so
 * registering `LangfuseSpanProcessor` was enough to get traces. `ai@7` has no
 * OpenTelemetry dependency at all — it emits telemetry *only* through
 * `Telemetry` integrations handed to `registerTelemetry()`. If that call is
 * removed, every AI SDK call still succeeds, every other test still passes,
 * and Langfuse silently receives nothing. These tests are the tripwire.
 *
 * They also pin the existing "no credentials → no registration" behaviour, so
 * local dev and CI e2e keep booting without Langfuse keys.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const registerOTel = vi.fn()
const registerTelemetry = vi.fn()

class FakeLangfuseSpanProcessor {
  constructor(readonly options: unknown) {}
}

class FakeLangfuseVercelAiSdkIntegration {}

vi.mock('@vercel/otel', () => ({ registerOTel }))
vi.mock('ai', () => ({ registerTelemetry }))
vi.mock('@langfuse/otel', () => ({ LangfuseSpanProcessor: FakeLangfuseSpanProcessor }))
vi.mock('@langfuse/vercel-ai-sdk', () => ({
  LangfuseVercelAiSdkIntegration: FakeLangfuseVercelAiSdkIntegration,
}))

beforeEach(() => {
  registerOTel.mockReset()
  registerTelemetry.mockReset()
  vi.resetModules()
})

describe('OpenTelemetry cold-start setup', () => {
  it('registers the Langfuse AI SDK integration so AI calls emit traces', async () => {
    vi.doMock('@/env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
        LANGFUSE_HOST: 'https://cloud.langfuse.com',
      },
    }))

    await import('./otel-setup')

    expect(registerTelemetry).toHaveBeenCalledTimes(1)
    expect(registerTelemetry.mock.calls[0]?.[0]).toBeInstanceOf(
      FakeLangfuseVercelAiSdkIntegration,
    )
  })

  it('wires the Langfuse span processor that exports those traces', async () => {
    vi.doMock('@/env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
        LANGFUSE_HOST: 'https://cloud.langfuse.com',
      },
    }))

    await import('./otel-setup')

    expect(registerOTel).toHaveBeenCalledTimes(1)
    const [config] = registerOTel.mock.calls[0] as [
      { serviceName: string; spanProcessors: unknown[] },
    ]
    expect(config.serviceName).toBe('yawaragi')
    expect(config.spanProcessors[0]).toBeInstanceOf(FakeLangfuseSpanProcessor)
  })

  it('stays silent when Langfuse credentials are absent (local dev / CI e2e)', async () => {
    vi.doMock('@/env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: undefined,
        LANGFUSE_SECRET_KEY: undefined,
        LANGFUSE_HOST: undefined,
      },
    }))

    await import('./otel-setup')

    expect(registerOTel).not.toHaveBeenCalled()
    expect(registerTelemetry).not.toHaveBeenCalled()
  })
})
