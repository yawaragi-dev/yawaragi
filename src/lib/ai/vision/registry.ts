import 'server-only'

import { env } from '@/env'
import { createAnthropicHaikuProvider } from './anthropic-haiku-provider'
import { createE2eStubVisionProvider } from './e2e-stub-provider'
import type { VisionProvider } from './vision-provider'

/**
 * Named keys into the vision-provider registry. Production lands one
 * entry — Anthropic Haiku 4.5 — because the slice spec is "one provider
 * behind a seam," not "two providers and a switch." The Finetune &
 * failover follow-up task (#105 § "Provider strategy") will land the
 * second production key here when its eval bake-off picks a vendor.
 *
 * `e2e-stub` is a deterministic non-production key the Playwright spec
 * selects via `VISION_PROVIDER=e2e-stub` so the CI scan E2E does not
 * burn Anthropic credit. It is never the default, never resolvable
 * unless someone explicitly sets the env var, and its `nodeEnv === 'production'`
 * guard refuses to run if the env var leaks into prod (PRD #105
 * § "Out of scope: ... eval-harness CI integration").
 *
 * The string union (rather than an enum) keeps the registry's entries
 * the single source of truth: `keyof typeof visionProviderFactories` and
 * this union are kept in sync at the type level.
 */
export type VisionProviderKey = 'anthropic-haiku-4-5' | 'e2e-stub'

export const DEFAULT_VISION_PROVIDER_KEY: VisionProviderKey = 'anthropic-haiku-4-5'

/**
 * Registry — string key to factory function. We register factories rather
 * than instances so each call site gets a fresh provider (no shared
 * mutable state) and so `ANTHROPIC_API_KEY` is read at first use rather
 * than at module load (matters for tests that import the registry but
 * never construct the Anthropic provider).
 */
const visionProviderFactories: Record<VisionProviderKey, () => VisionProvider> = {
  'anthropic-haiku-4-5': () => createAnthropicHaikuProvider(),
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
