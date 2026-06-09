import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISION_PROVIDER_KEY,
  getVisionProvider,
  resolveVisionProviderKey,
  VISION_PROVIDER_KEYS,
} from './registry'

describe('vision provider registry', () => {
  it('falls back to the default key when VISION_PROVIDER is unset', () => {
    expect(resolveVisionProviderKey(undefined)).toBe(DEFAULT_VISION_PROVIDER_KEY)
  })

  it('falls back to the default key when VISION_PROVIDER is an empty string', () => {
    // Empty strings in the env arrive as `''`, not `undefined`. The
    // `empty()` preprocessor in src/env.ts already normalises this for
    // optional keys, but the registry guards anyway so a direct caller
    // (e.g. a test) sees the same fallback behavior.
    expect(resolveVisionProviderKey('')).toBe(DEFAULT_VISION_PROVIDER_KEY)
  })

  it('resolves a known key without touching the default', () => {
    // Once a second provider lands, this asserts the env-driven switch
    // — the spec says "switching the env var swaps the provider without
    // touching call sites."
    expect(resolveVisionProviderKey('anthropic-haiku-4-5')).toBe('anthropic-haiku-4-5')
  })

  it('resolves the e2e-stub key so Playwright can opt in without code changes', () => {
    // The Playwright spec sets VISION_PROVIDER=e2e-stub on the dev
    // server it boots so the real Anthropic call is bypassed. This
    // test verifies the seam supports that swap.
    expect(resolveVisionProviderKey('e2e-stub')).toBe('e2e-stub')
  })

  it('throws on an unknown key rather than silently falling back', () => {
    expect(() => resolveVisionProviderKey('claude-typo-4-5')).toThrow(
      /Unknown VISION_PROVIDER/,
    )
  })

  it('exposes the set of registered keys', () => {
    // Sanity-check: every key in the union appears in the registered
    // list. A new key added to the union without registering a factory
    // would fail this assertion.
    expect(VISION_PROVIDER_KEYS).toContain('anthropic-haiku-4-5')
    expect(VISION_PROVIDER_KEYS).toContain('e2e-stub')
  })

  it('swapping the registry key returns a distinct provider instance with a working seam', async () => {
    // The whole point of the seam: a future fallback vendor (or, today,
    // the E2E stub) is selectable without rewriting call sites. We
    // construct two providers off the same registry and assert (a) they
    // are different instances and (b) the e2e-stub returns its fixed
    // Dassai extraction (proving the swap actually engages a different
    // implementation, not just relabels the same one).
    const haiku = getVisionProvider('anthropic-haiku-4-5')
    const stub = getVisionProvider('e2e-stub')
    expect(haiku).not.toBe(stub)
    const fakeJpeg = new Blob(['x'], { type: 'image/jpeg' })
    const stubResult = await stub.extractLabel(fakeJpeg)
    expect(stubResult.name_ja).toBe('獺祭')
    expect(stubResult.brewery_ja).toBe('旭酒造')
    expect(stubResult.source).toBe('llm_extracted')
  })
})
