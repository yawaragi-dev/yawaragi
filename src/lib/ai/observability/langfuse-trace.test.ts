/**
 * Phase 4 / S4 (#141): tests for the Langfuse-trace wrapper.
 * Updated for the AI SDK 7 migration (#268).
 *
 * The wrapper's contract:
 *
 *   1. Every traced call passes `telemetry: { isEnabled: true, functionId,
 *      recordInputs, recordOutputs }` to the AI SDK primitive. We assert by
 *      spying on `generateText` / `generateObject` and inspecting the args.
 *   2. Trace identity (`traceName` + the caller's flat `metadata` bag) is
 *      carried by Langfuse's `propagateAttributes` around the call. AI SDK 7
 *      deleted `TelemetrySettings.metadata`, so this is the *only* place the
 *      identifying attributes live — a regression here de-identifies every
 *      production trace without breaking anything else, which is exactly why
 *      it is pinned.
 *   3. `recordInputs` / `recordOutputs` default to `false` (ADR-0009
 *      "redacted prompts and completions" posture).
 *   4. The wrapper passes through every other arg unchanged.
 *   5. Caller-supplied `telemetry` / `experimental_telemetry` is silently
 *      overridden — tracing is non-negotiable.
 *   6. In production, missing `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`
 *      throws BEFORE the AI SDK is called.
 *   7. Outside production, missing env is tolerated (local dev / e2e).
 *
 * We don't spin up a real OpenTelemetry SDK here. On AI SDK 7 the span-
 * producing layer is `LangfuseVercelAiSdkIntegration` (registered in
 * `otel-setup.ts` — see `otel-setup.test.ts`), and `LangfuseSpanProcessor`
 * ships the spans. Neither layer is ours to test — what's ours is whether
 * the wrapper's args and propagated attributes are shaped correctly.
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

// `propagateAttributes` is the AI SDK 7 replacement for
// `experimental_telemetry.metadata`. The stub records the params and still
// invokes the wrapped function, so the assertions below cover both "the
// identity was propagated" and "the call still happened".
const propagateAttributesSpy =
  vi.fn<(params: Record<string, unknown>, fn: () => unknown) => unknown>()

vi.mock('@langfuse/tracing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@langfuse/tracing')>()
  return {
    ...actual,
    propagateAttributes: (params: Record<string, unknown>, fn: () => unknown) =>
      propagateAttributesSpy(params, fn),
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
  buildPropagatedAttributes,
  buildTelemetryOptions,
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
  propagateAttributesSpy.mockReset().mockImplementation((_params, fn) => fn())
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('buildTelemetryOptions', () => {
  it('always sets isEnabled true and defaults inputs/outputs to redacted', () => {
    const options = buildTelemetryOptions({
      functionId: 'scan-extract-label',
      metadata: { 'provider.key': 'anthropic-haiku-4-5' },
    })

    expect(options).toMatchObject({
      isEnabled: true,
      functionId: 'scan-extract-label',
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('honours an explicit recordInputs / recordOutputs opt-in', () => {
    const options = buildTelemetryOptions({
      functionId: 'debug-replay',
      recordInputs: true,
      recordOutputs: true,
    })

    expect(options.recordInputs).toBe(true)
    expect(options.recordOutputs).toBe(true)
  })
})

describe('buildPropagatedAttributes', () => {
  it('names the trace after the call site and carries the caller metadata', () => {
    expect(
      buildPropagatedAttributes({
        functionId: 'suggest-tool-loop',
        metadata: { 'seed.kind': 'brand', 'seed.brandId': '1' },
      }),
    ).toEqual({
      traceName: 'suggest-tool-loop',
      metadata: { 'seed.kind': 'brand', 'seed.brandId': '1' },
    })
  })

  it('omits metadata entirely when the caller supplied none', () => {
    expect(buildPropagatedAttributes({ functionId: 'scan-extract-label' })).toEqual({
      traceName: 'scan-extract-label',
    })
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
    expect(passedArgs.telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'suggest-tool-loop',
      recordInputs: false,
      recordOutputs: false,
    })
  })

  it('identifies the trace in Langfuse with the call site and its metadata', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    await tracedGenerateText(
      { functionId: 'suggest-tool-loop', metadata: { 'session.hash': 'abc123' } },
      { model: 'model-stub' as never, prompt: 'hello' },
    )

    expect(propagateAttributesSpy).toHaveBeenCalledTimes(1)
    expect(propagateAttributesSpy.mock.calls[0]?.[0]).toEqual({
      traceName: 'suggest-tool-loop',
      metadata: { 'session.hash': 'abc123' },
    })
  })

  it('overrides caller-supplied telemetry to keep tracing non-negotiable', async () => {
    vi.stubEnv('NODE_ENV', 'test')

    await tracedGenerateText(
      { functionId: 'enforced' },
      {
        model: 'model-stub' as never,
        prompt: 'hi',
        telemetry: { isEnabled: false, functionId: 'sneaky-disable' },
        experimental_telemetry: { isEnabled: false, functionId: 'sneaky-legacy-disable' },
      } as Parameters<typeof tracedGenerateText>[1],
    )

    const passedArgs = generateTextMock.mock.calls[0]?.[0] as Record<string, unknown>
    expect(passedArgs.telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'enforced',
    })
    // The deprecated alias must not survive — AI SDK 7 still reads it, so a
    // leftover `isEnabled: false` there could silence the call.
    expect(passedArgs.experimental_telemetry).toBeUndefined()
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
    expect(passedArgs.telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'scan-extract-label',
      recordInputs: false,
      recordOutputs: false,
    })
    expect(propagateAttributesSpy.mock.calls[0]?.[0]).toEqual({
      traceName: 'scan-extract-label',
      metadata: { 'model.id': 'claude-haiku-4-5' },
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

describe('LANGFUSE_RECORD_IO payload recording', () => {
  /** Re-import the module against a specific env + NODE_ENV. */
  async function buildWith(recordIo: string | undefined, nodeEnv: string) {
    vi.resetModules()
    vi.doMock('@/env', () => ({
      env: {
        LANGFUSE_PUBLIC_KEY: 'pk-test',
        LANGFUSE_SECRET_KEY: 'sk-test',
        LANGFUSE_HOST: 'https://cloud.langfuse.com',
        LANGFUSE_RECORD_IO: recordIo,
      },
    }))
    vi.stubEnv('NODE_ENV', nodeEnv)
    const mod = await import('./langfuse-trace')
    return mod.buildTelemetryOptions({ functionId: 'suggest-tool-loop' })
  }

  afterEach(() => {
    vi.doUnmock('@/env')
    vi.resetModules()
  })

  it('keeps prompts out of Langfuse when the flag is unset', async () => {
    const options = await buildWith(undefined, 'development')

    expect(options.recordInputs).toBe(false)
    expect(options.recordOutputs).toBe(false)
  })

  it('records prompts locally when the maintainer opts in', async () => {
    const options = await buildWith('1', 'development')

    expect(options.recordInputs).toBe(true)
    expect(options.recordOutputs).toBe(true)
  })

  it('REFUSES to record prompts in production even when the flag is set', async () => {
    // The guard that makes ADR-0009's "redacted prompts + completions"
    // RoPA entry true by construction: a stray LANGFUSE_RECORD_IO=1 on a
    // production deploy must not start retaining visitors' queries and
    // model completions for 30 days.
    const options = await buildWith('1', 'production')

    expect(options.recordInputs).toBe(false)
    expect(options.recordOutputs).toBe(false)
  })

  it('treats any value other than "1" as off', async () => {
    const options = await buildWith('true', 'development')

    expect(options.recordInputs).toBe(false)
  })
})
