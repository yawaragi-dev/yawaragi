import 'server-only'

import { env } from '@/env'
import type { ExpressionStore } from '@/lib/collection/expression-store'
import { UpstashExpressionStore } from '@/lib/collection/upstash-expression-store'

/**
 * The production {@link ExpressionStore}, or `null` when the Upstash env pair
 * is absent — the mirror of `getCellarStore()`, sharing its database and its
 * degrade-to-unavailable posture.
 */
export function getExpressionStore(): ExpressionStore | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new UpstashExpressionStore(url, token)
}
