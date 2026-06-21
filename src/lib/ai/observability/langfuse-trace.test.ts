/**
 * Phase 4 / S4 (#141): tests for the Langfuse-trace wrapper.
 *
 * The wrapper's contract:
 *
 *   1. Every traced call passes `experimental_telemetry: { isEnabled: true,
 *      functionId, metadata, recordInputs, recordOutputs }` to the AI SDK
 *      primitive. We assert by spying on `generateText` / `generateObject`
 *      and inspecting the args.
 *   2. `recordInputs` / `recordOutputs` default to `false` (ADR-0009
 *      "redacted prompts and completions" posture).
 *   3. The wrapper passes through every other arg unchanged.
 *   4. Caller-supplied `experimental_telemetry` is silently overridden —
 *      tracing is non-negotiable.
 *   5. In production, missing `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
 *      throws BEFORE the AI SDK is called.
 *   6. Outside production, missing env is tolerated (local dev / e2e).
 *
 * We don't spin up a real OpenTelemetry SDK here. The AI SDK 6's job is
 * to emit the OTel span when `isEnabled: true`; `LangfuseSpanProcessor`
 * (registered in `otel-setup.ts`) ships it to Langfuse. Neither layer
 * is ours to test — what's ours is whether the wrapper's args are
 * shaped correctly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn(),
  }
})

vi.mock('@/env', () => ({
  env: {
    LANGFUSE_PUBLIC_KEY: 'pk-test',
    LANGFUSE_SECRET_KEY: 'sk-test',
    LANGFUSE_HOST: 'https://cloud.langfuse.com',
  },
}))

import { generateObject, generateText } from 'ai'

import {
  buildTelemetrySettings,
  isLangfuseConfigured,
  tracedGenerateObject,
  tracedGenerateText,
} from './langfuse-trace'

// The mocks are typed in the loose `vi.fn()` shape; cast to the
// vitest mock type for the .mock.calls assertion ergonomics.
const generateTextMock = vi.mocked(generateText)
const generateObjectMock = vi.mocked(generateObject)

beforeEach(() => {
  generateTextMock.mockReset().mockResolvedValue({ text: '' } as never)
  generateObjectMock.mockReset().mockResolvedValue({ object: {} } as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildTelemetrySettings', () => {
  it('always sets isEnabled true and defaults inputs/outputs to redacted', () => {
    const settings = buildTelemetrySettings({
      functionId: 'scan-extract-label',
      metadata: { 'provider.key': 'anthropic-haiku-4-5' },
    })

    expect(settings).toMatchObject({
      isEnabled: true,
      functionId: 'scan-extract-label',
      metadata: { 'provider.key': 'anthropic-haiku-4-5' },
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('honours an explicit recordInputs / recordOutputs opt-in', () => {
    const settings = buildTelemetrySettings({
      functionId: 'debug-replay',
      recordInputs: true,
      recordOutputs: true,
    })

    expect(settings.recordInputs).toBe(true)
    expect(settings.recordOutputs).toBe(true)
  })
})

describe('isLangfuseConfigured', () => {
  it('returns true when both Langfuse keys are present', () => {
    expect(isLangfuseConfigured()).toBe(true)
  })
})

describe('tracedGenerateText', () => {
  it('forwards args to generateText with telemetry injected', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    await tracedGenerateText(
      { functionId: 'suggest-tool-loop', metadata: { 'session.hash': 'abc123' } },
      {
        model: 'model-stub' as never,
        prompt: 'hello',
      },
    )

    expect(generateTextMock).toHaveBeenCalledTimes(1)
    const passedArgs = generateTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(passedArgs.prompt).toBe('hello')
    expect(passedArgs.experimental_telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'suggest-tool-loop',
      metadata: { 'session.hash': 'abc123' },
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('overrides caller-supplied experimental_telemetry to keep tracing non-negotiable', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    await tracedGenerateText(
      { functionId: 'enforced' },
      {
        model: 'model-stub' as never,
        prompt: 'hi',
        experimental_telemetry: { isEnabled: false, functionId: 'sneaky-disable' },
      } as Parameters<typeof tracedGenerateText>[1],
    )

    const passedArgs = generateTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(passedArgs.experimental_telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'enforced',
    })
  })
})

describe('tracedGenerateObject', () => {
  it('forwards args to generateObject with telemetry injected', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    await tracedGenerateObject(
      { functionId: 'scan-extract-label', metadata: { 'model.id': 'claude-haiku-4-5' } },
      {
        model: 'model-stub' as never,
        prompt: 'extract',
      } as Parameters<typeof tracedGenerateObject>[1],
    )

    expect(generateObjectMock).toHaveBeenCalledTimes(1)
    const passedArgs = generateObjectMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(passedArgs.prompt).toBe('extract')
    expect(passedArgs.experimental_telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'scan-extract-label',
      metadata: { 'model.id': 'claude-haiku-4-5' },
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('propagates errors from the underlying generateObject', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    generateObjectMock.mockRejectedValueOnce(new Error('model_unreachable'))

    await expect(
      tracedGenerateObject(
        { functionId: 'scan-extract-label' },
        { model: 'model-stub' as never, prompt: 'x' } as Parameters<
          typeof tracedGenerateObject
        >[1],
      ),
    ).rejects.toThrow('model_unreachable')
  })
})

describe('production env guard', () => {
  beforeEach(() => {
    // Reset module cache so the next dynamic import of
    // './langfuse-trace' picks up the new env mock instead of the
    // top-of-file vi.mock('@/env') applied to the other suites.
    vi.resetModules()
    vi.doMock('@/env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: undefined,
        LANGFUSE_SECRET_KEY: undefined,
        LANGFUSE_HOST: undefined,
      },
    }))
  })

  afterEach(() => {
    vi.doUnmock('@/env')
    vi.resetModules()
  })

  it('throws if Langfuse keys are missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    // Re-import the module so it picks up the new env mock.
    const { tracedGenerateObject: tracedFresh } = await import('./langfuse-trace')

    await expect(
      tracedFresh(
        { functionId: 'scan-extract-label' },
        { model: 'm' as never, prompt: 'x' } as Parameters<typeof tracedFresh>[1],
      ),
    ).rejects.toThrow(/LANGFUSE_PUBLIC_KEY/)
  })

  it('no-ops outside production even with missing keys (local dev / e2e)', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const { tracedGenerateObject: tracedFresh } = await import('./langfuse-trace')

    // Doesn't throw on the env-guard; just proxies through to the
    // (mocked) generateObject as normal.
    await expect(
      tracedFresh(
        { functionId: 'scan-extract-label' },
        { model: 'm' as never, prompt: 'x' } as Parameters<typeof tracedFresh>[1],
      ),
    ).resolves.toBeDefined()
  })
})
