import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the two symbols this module uses. Listing them explicitly rather
// than spreading `importActual` is safe here because the module's imports
// are exactly these two — but if it grows a third, this factory must grow
// with it or the new export silently becomes `undefined`.
const updateActiveObservation = vi.fn()
const startActiveObservation = vi.fn(
  async (_name: string, fn: () => unknown) => await fn(),
)

vi.mock('@langfuse/tracing', () => ({
  startActiveObservation: (...args: unknown[]) =>
    (startActiveObservation as unknown as (...a: unknown[]) => unknown)(...args),
  updateActiveObservation: (...args: unknown[]) =>
    (updateActiveObservation as unknown as (...a: unknown[]) => unknown)(...args),
}))

const { recordActionMetadata, withActionSpan } = await import(
  '@/lib/ai/observability/action-span'
)

/** The attributes passed to the Nth updateActiveObservation call. */
function attrsOfCall(n = 0): Record<string, unknown> {
  return updateActiveObservation.mock.calls[n]?.[0] as Record<string, unknown>
}

beforeEach(() => {
  updateActiveObservation.mockClear()
  startActiveObservation.mockClear()
})

describe('withActionSpan', () => {
  it('records what the action decided, not merely that it ran', async () => {
    // The #270 failure: a tool loop that completes cleanly and still
    // hands back an empty list. The per-call spans look healthy, so the
    // outcome is the only thing that distinguishes it from success.
    const result = await withActionSpan(
      {
        name: 'suggest-action',
        classify: (r: { status: string; suggestions: unknown[] }) =>
          r.suggestions.length === 0
            ? { outcome: 'no_match', level: 'WARNING' as const }
            : { outcome: 'ok' },
      },
      async () => ({ status: 'ok', suggestions: [] }),
    )

    expect(result).toEqual({ status: 'ok', suggestions: [] })
    expect(attrsOfCall().metadata).toMatchObject({ 'action.outcome': 'no_match' })
    expect(attrsOfCall().level).toBe('WARNING')
  })

  it('marks a silent failure at ERROR so it is filterable in Langfuse', async () => {
    // Being findable is the entire point of #287 — an outcome buried at
    // DEFAULT is no more visible than the debug log it replaces.
    await withActionSpan(
      {
        name: 'suggest-action',
        classify: () => ({
          outcome: 'step_budget_exhausted',
          level: 'ERROR' as const,
          statusMessage: 'step budget exhausted before a final answer',
          metadata: { 'loop.steps': 6 },
        }),
      },
      async () => ({ status: 'error' }),
    )

    expect(attrsOfCall()).toMatchObject({
      level: 'ERROR',
      statusMessage: 'step budget exhausted before a final answer',
    })
    // Numbers survive as numbers here, unlike the string-only
    // propagateAttributes path — so the value stays chartable.
    expect(attrsOfCall().metadata).toMatchObject({ 'loop.steps': 6 })
  })

  it('merges pre-run metadata with the outcome metadata', async () => {
    await withActionSpan(
      {
        name: 'suggest-action',
        metadata: { 'seed.kind': 'query' },
        classify: () => ({ outcome: 'ok', metadata: { 'suggestions.count': 5 } }),
      },
      async () => null,
    )

    expect(attrsOfCall().metadata).toMatchObject({
      'seed.kind': 'query',
      'suggestions.count': 5,
      'action.outcome': 'ok',
    })
  })

  it('records a thrown error and rethrows it unchanged', async () => {
    const boom = new Error('MCP client unreachable')

    await expect(
      withActionSpan(
        { name: 'suggest-action', classify: () => ({ outcome: 'ok' }) },
        async () => {
          throw boom
        },
      ),
    ).rejects.toBe(boom)

    expect(attrsOfCall()).toMatchObject({
      level: 'ERROR',
      statusMessage: 'MCP client unreachable',
    })
    expect(attrsOfCall().metadata).toMatchObject({ 'action.outcome': 'threw' })
  })

  it('still returns the action result when telemetry itself fails', async () => {
    // Telemetry must never take the surface down. A visitor's suggestions
    // matter more than an attribute landing in Langfuse.
    updateActiveObservation.mockImplementationOnce(() => {
      throw new Error('langfuse exporter down')
    })

    const result = await withActionSpan(
      { name: 'suggest-action', classify: () => ({ outcome: 'ok' }) },
      async () => ({ status: 'ok' }),
    )

    expect(result).toEqual({ status: 'ok' })
  })
})

describe('recordActionMetadata', () => {
  it('attaches mid-flight values to the active span', async () => {
    recordActionMetadata({ 'cache.hitRatio': 0.76 })

    expect(attrsOfCall().metadata).toMatchObject({ 'cache.hitRatio': 0.76 })
  })

  it('is a no-op outside an active span rather than throwing', () => {
    // Unit tests call actions directly, with no observation in context.
    updateActiveObservation.mockImplementationOnce(() => {
      throw new Error('no active observation')
    })

    expect(() => recordActionMetadata({ 'cache.hitRatio': 0 })).not.toThrow()
  })
})
