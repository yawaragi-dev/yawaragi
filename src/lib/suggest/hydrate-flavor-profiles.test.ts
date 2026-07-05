import { describe, expect, it, vi } from 'vitest'
import type { Suggestion } from '@/lib/schemas/suggestion'
import { hydrateFlavorProfiles } from './hydrate-flavor-profiles'

/**
 * Unit coverage for the Phase 4 / S5 round-2 fan-out.
 *
 * The action's happy path fans out one `get_sake_details` call per
 * returned Suggestion (in parallel via `Promise.allSettled`) to attach a
 * canonical `flavor_profile` to each card that has one in the mirror.
 * These tests lock down the invariants that make that fan-out safe:
 *
 *   - one failed lookup doesn't crash the whole action
 *   - a null-flavor row (brand with no `flavor_charts` entry) drops the
 *     field cleanly instead of throwing / injecting a placeholder
 *   - parallel dispatch — the fan-out is one round-trip of latency, not N
 *   - the resulting flavor_profile carries `source: 'sakenowa'`
 *
 * The `get_sake_details` tool is stubbed as a plain object with an
 * `execute` method matching the AI SDK MCP tool contract. That's the
 * public surface `hydrateFlavorProfiles` calls; if the underlying MCP
 * response shape ever shifts, the parse layer (structuredContent →
 * content-text fallback) protects the caller.
 */

function suggestion(brandId: number): Suggestion {
  return {
    brandId: { source: 'sakenowa', value: brandId },
    name_ja: { source: 'sakenowa', value: `sake-${brandId}` },
    name_romaji: { source: 'sakenowa', value: `Sake${brandId}` },
    reason: { source: 'llm_inferred', value: 'A comparable profile.' },
  }
}

function detailsResult(brandId: number, flavorProfile: unknown) {
  const payload = {
    found: true,
    sake: { brandId, name: `sake-${brandId}` },
    flavorProfile,
    flavorTags: [],
  }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: { details: payload },
  }
}

describe('hydrateFlavorProfiles', () => {
  it('attaches flavor_profile pinned to sakenowa when the MCP tool returns a chart', async () => {
    const execute = vi.fn().mockResolvedValue(
      detailsResult(101, { f1: 0.7, f2: 0.4, f3: 0.3, f4: 0.5, f5: 0.6, f6: 0.8 }),
    )
    const tools = { get_sake_details: { execute } }

    const [enriched] = await hydrateFlavorProfiles([suggestion(101)], tools)

    expect(enriched.flavor_profile).toBeDefined()
    expect(enriched.flavor_profile?.source).toBe('sakenowa')
    expect(enriched.flavor_profile?.f1).toBe(0.7)
    expect(enriched.flavor_profile?.f6).toBe(0.8)
  })

  it('leaves flavor_profile off the card when MCP returns flavorProfile: null (no chart in mirror)', async () => {
    // Brand 1 (新十津川) is the canonical "no chart" example — the fan-
    // out must gracefully skip it, not blow up. Card renders without
    // the axis cluster.
    const execute = vi.fn().mockResolvedValue(detailsResult(1, null))
    const tools = { get_sake_details: { execute } }

    const [enriched] = await hydrateFlavorProfiles([suggestion(1)], tools)

    expect(enriched.flavor_profile).toBeUndefined()
    // Original suggestion is preserved otherwise — brandId, name, reason.
    expect(enriched.brandId.value).toBe(1)
    expect(enriched.reason.value).toBe('A comparable profile.')
  })

  it('drops flavor_profile when the MCP call rejects (isolated per-brand failure)', async () => {
    // One failed lookup MUST NOT fail the whole action. Promise.allSettled
    // is mandatory for the fan-out; this test would fail if the impl
    // switched to Promise.all.
    const execute = vi
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('network unreachable')
      })
      .mockResolvedValueOnce(
        detailsResult(42, { f1: 0.2, f2: 0.3, f3: 0.4, f4: 0.5, f5: 0.6, f6: 0.7 }),
      )
    const tools = { get_sake_details: { execute } }

    const [first, second] = await hydrateFlavorProfiles(
      [suggestion(101), suggestion(42)],
      tools,
    )

    // Failed lookup — no flavor_profile, but the card still renders.
    expect(first.flavor_profile).toBeUndefined()
    expect(first.brandId.value).toBe(101)
    // Successful sibling lookup — flavor_profile attached.
    expect(second.flavor_profile?.f1).toBe(0.2)
  })

  it('drops flavor_profile when MCP returns { found: false } (unknown brandId)', async () => {
    // Defensive — a Suggestion whose brandId isn't in the mirror
    // shouldn't appear in production (the LLM only picks from
    // find_similar_sakes candidates) but the fan-out still handles the
    // case cleanly rather than throwing a shape error.
    const execute = vi.fn().mockResolvedValue({
      content: [
        { type: 'text' as const, text: JSON.stringify({ found: false, brandId: 999 }) },
      ],
      structuredContent: { details: { found: false, brandId: 999 } },
    })
    const tools = { get_sake_details: { execute } }

    const [enriched] = await hydrateFlavorProfiles([suggestion(999)], tools)

    expect(enriched.flavor_profile).toBeUndefined()
  })

  it('fans out in parallel (one round-trip of latency, not N)', async () => {
    // The fan-out uses Promise.allSettled over parallel dispatches. If
    // the impl regressed to a sequential `for` loop, the total time
    // would be O(N * per-call); this test would then take ~150ms
    // instead of ~50ms. We assert the parallel property by observing
    // that all executes were called BEFORE any of them resolved.
    let concurrentInFlight = 0
    let peakInFlight = 0
    const execute = vi.fn().mockImplementation(async ({ brandId }: { brandId: number }) => {
      concurrentInFlight += 1
      peakInFlight = Math.max(peakInFlight, concurrentInFlight)
      await new Promise((resolve) => setTimeout(resolve, 20))
      concurrentInFlight -= 1
      return detailsResult(brandId, { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 })
    })
    const tools = { get_sake_details: { execute } }

    await hydrateFlavorProfiles(
      [suggestion(1), suggestion(2), suggestion(3)],
      tools,
    )

    // If the fan-out were sequential, peakInFlight would be 1. Three
    // parallel dispatches means peak >= 2 (the exact number can vary
    // with the event loop but must be at least 2 to prove parallelism).
    expect(peakInFlight).toBeGreaterThanOrEqual(2)
    expect(execute).toHaveBeenCalledTimes(3)
  })

  it('returns the same suggestion list untouched when get_sake_details is not in the tool set', async () => {
    // Defence-in-depth — a future MCP version could rename or remove
    // the tool. The action must not crash; it simply forgoes the
    // fan-out and returns the LLM's suggestions as-is.
    const tools = {}

    const input = [suggestion(101), suggestion(102)]
    const result = await hydrateFlavorProfiles(input, tools)

    expect(result).toHaveLength(2)
    expect(result[0].flavor_profile).toBeUndefined()
    expect(result[1].flavor_profile).toBeUndefined()
  })

  it('drops flavor_profile when the axis values are out of [0,1] (schema rejects)', async () => {
    // A future MCP misconfiguration or bad data row shouldn't get a
    // malformed card through. The schema validation at the seam is
    // load-bearing.
    const execute = vi.fn().mockResolvedValue(
      detailsResult(101, { f1: 5, f2: 0.4, f3: 0.3, f4: 0.5, f5: 0.6, f6: 0.8 }),
    )
    const tools = { get_sake_details: { execute } }

    const [enriched] = await hydrateFlavorProfiles([suggestion(101)], tools)

    expect(enriched.flavor_profile).toBeUndefined()
  })
})
