import 'server-only'

import { anthropic } from '@ai-sdk/anthropic'
import { env } from '@/env'
import { createAnthropicHaikuProvider } from './anthropic-haiku-provider'
import { createE2eStubVisionProvider } from './e2e-stub-provider'
import type { VisionProvider } from './vision-provider'

/**
 * Named keys into the vision-provider registry.
 *
 * - `anthropic-haiku-4-5`: tier-1 default. Cheap, fast, handles clear
 *   bottles (UMAMI-style Latin, well-lit kanji on plain backgrounds).
 * - `anthropic-sonnet-4-6`: tier-2 fallback. Materially better at
 *   brush-style calligraphic kanji and busy backgrounds. ~5x cost vs
 *   Haiku, but `scanAction`'s two-tier retry only invokes it on
 *   no_match / low_confidence / extraction_failed from tier-1, so the
 *   amortised cost stays close to Haiku on the happy path.
 * - `e2e-stub`: deterministic non-production key the Playwright spec
 *   selects via `VISION_PROVIDER=e2e-stub`. Never the default; its
 *   `nodeEnv === 'production'` guard refuses to run in prod.
 */
export type VisionProviderKey =
  | 'anthropic-haiku-4-5'
  | 'anthropic-sonnet-4-6'
  | 'e2e-stub'

export const DEFAULT_VISION_PROVIDER_KEY: VisionProviderKey = 'anthropic-haiku-4-5'

// Tier-2 retry provider used by `scanAction` when tier-1 (Haiku) can't
// resolve the bottle. Exported as a named constant so the retry site
// and the registry are kept in sync (changing this string also changes
// the registry entry both refer to).
export const TIER_2_VISION_PROVIDER_KEY: VisionProviderKey = 'anthropic-sonnet-4-6'

/**
 * Registry — string key to factory function. We register factories rather
 * than instances so each call site gets a fresh provider (no shared
 * mutable state) and so `ANTHROPIC_API_KEY` is read at first use rather
 * than at module load (matters for tests that import the registry but
 * never construct the Anthropic provider).
 *
 * The Sonnet factory reuses the Haiku provider's plumbing (prompt,
 * schema, ZDR warning, debug log) and just swaps the model id —
 * matching the "Haiku" file name is now historical; the provider is
 * model-parameterised.
 */
const visionProviderFactories: Record<VisionProviderKey, () => VisionProvider> = {
  // Phase 4 / S4 (#141): factories tag each construction with its
  // registry key as a telemetry attribute, so Langfuse traces (and
  // any future OTel sink) can group calls by provider. Inline rather
  // than computed so the key↔factory binding stays a static literal
  // that a grep can find.
  'anthropic-haiku-4-5': () =>
    createAnthropicHaikuProvider({
      telemetryMetadata: { 'provider.key': 'anthropic-haiku-4-5' },
    }),
  'anthropic-sonnet-4-6': () =>
    createAnthropicHaikuProvider({
      model: anthropic('claude-sonnet-4-6'),
      telemetryMetadata: { 'provider.key': 'anthropic-sonnet-4-6' },
    }),
  'e2e-stub': () => createE2eStubVisionProvider(),
}

/**
 * The set of known keys, exported so callers (and tests) can discover the
 * full registry without reaching into the factories map.
 */
export const VISION_PROVIDER_KEYS: ReadonlyArray<VisionProviderKey> = Object.keys(
  visionProviderFactories,
) as VisionProviderKey[]

function isVisionProviderKey(value: string): value is VisionProviderKey {
  return (VISION_PROVIDER_KEYS as readonly string[]).includes(value)
}

/**
 * Resolves the `VISION_PROVIDER` env value to a registry key. Unknown
 * values throw — a typo'd env var must not silently fall through to a
 * default that hides the misconfiguration. An unset / empty env var
 * resolves to the default.
 */
export function resolveVisionProviderKey(
  envValue: string | undefined = env.VISION_PROVIDER,
): VisionProviderKey {
  if (envValue == null || envValue === '') return DEFAULT_VISION_PROVIDER_KEY
  if (!isVisionProviderKey(envValue)) {
    throw new Error(
      `Unknown VISION_PROVIDER=${envValue}. Known keys: ${VISION_PROVIDER_KEYS.join(', ')}.`,
    )
  }
  return envValue
}

/**
 * Returns the configured default vision provider for the running
 * environment. `scanAction` calls this; tests instantiate specific
 * providers directly via `createAnthropicHaikuProvider({...})` or
 * `getVisionProvider('anthropic-haiku-4-5')`.
 */
export function getDefaultVisionProvider(): VisionProvider {
  const key = resolveVisionProviderKey()
  return visionProviderFactories[key]()
}

/**
 * Returns the provider for a specific registry key. Tests use this
 * indirection to assert that switching the env var swaps the resolved
 * provider without touching call sites.
 */
export function getVisionProvider(key: VisionProviderKey): VisionProvider {
  return visionProviderFactories[key]()
}
