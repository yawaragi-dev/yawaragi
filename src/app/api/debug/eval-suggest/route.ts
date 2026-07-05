/**
 * DEBUG / EVAL ROUTE — `/api/debug/eval-suggest`
 *
 * Bearer-gated invocation of `suggestAction` from a real HTTP request
 * context. Exists so `pnpm eval suggest-jp` (the offline eval harness
 * introduced by Phase 4 / S7 / #145) can drive the same code path
 * production visitors hit, without having to spin up a fake Next
 * request scope in a Node script.
 *
 * Why this route (not the visitor-facing `/suggest` RSC page) is what
 * the eval calls:
 *
 *   - The RSC page returns HTML; the eval wants JSON. This route
 *     serialises `SuggestActionState` directly.
 *   - The RSC page renders once per request and can't easily accept a
 *     freeform seed via a JSON body; this route takes a POST + JSON
 *     body, one call per query.
 *   - The RSC page requires the age-gate cookie; the eval is a
 *     maintainer tool, not a visitor session — bearer-auth is the
 *     right seam.
 *
 * Bearer-authed via the existing `CRON_SECRET` (same posture as
 * `/api/debug/mcp-smoke`) so no new secret needs to be provisioned in
 * Vercel for a route only the maintainer's local eval hits. The route
 * is guarded twice: (a) authorise or 401, (b) refuse to run when
 * `NODE_ENV === 'production'` — which Vercel sets on BOTH production
 * AND preview builds, so even a valid bearer + a leaked preview URL
 * can't reach `suggestAction` through this route. The eval is a
 * local-dev tool by design.
 *
 * Rate limit: the eval sets `RATE_LIMIT_BYPASS=1` before the runner
 * imports env.ts, so the dev server picks that up from `.env.local`
 * or from `NEXT_PUBLIC_...` env if the maintainer set it there. Without
 * the bypass, the eval would cap at query 4 (3/24h anonymous limit).
 * Confirm by checking `state.status === 'rate_limited'` in the eval's
 * output; if it appears, the dev server needs `RATE_LIMIT_BYPASS=1` in
 * its `.env.local` too.
 */
import 'server-only'

import { env } from '@/env'
import { authorizeCronRequest } from '@/lib/cron/authorize'
import { suggestAction } from '@/lib/suggest/suggest-action'
import type { SuggestSeed } from '@/lib/suggest/suggest-action-state'

// Force Node runtime: `suggestAction` transitively imports @ai-sdk/mcp
// which uses Node-only fetch agents under streamable HTTP. Same posture
// as the mcp-smoke route.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RESPONSE_HEADERS = { 'Cache-Control': 'no-store' } as const

function fail(status: number, body: object): Response {
  return Response.json(body, { status, headers: RESPONSE_HEADERS })
}

export async function POST(request: Request): Promise<Response> {
  // Belt: never expose this route in production, even to a valid
  // bearer. The eval is a dev-time tool. A Vercel deploy accidentally
  // shipping a valid CRON_SECRET into a preview URL still can't
  // reach this handler through this route.
  if (process.env.NODE_ENV === 'production') {
    return fail(404, { error: 'not_found' })
  }

  // Braces: bearer-auth via the existing shared secret. Constant-time
  // compare inside authorizeCronRequest so timing doesn't leak the
  // prefix.
  const authResult = authorizeCronRequest(
    request.headers.get('authorization'),
    env.CRON_SECRET,
  )
  if (!authResult.ok) {
    return fail(401, { error: 'unauthorized' })
  }

  let seed: SuggestSeed
  try {
    const body = (await request.json()) as unknown
    seed = validateSeedBody(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return fail(400, { error: 'invalid_body', detail: message })
  }

  try {
    const state = await suggestAction(seed)
    return Response.json(state, { status: 200, headers: RESPONSE_HEADERS })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return fail(500, { error: 'action_threw', detail: message })
  }
}

function validateSeedBody(body: unknown): SuggestSeed {
  if (typeof body !== 'object' || body === null) {
    throw new Error('body must be a JSON object')
  }
  const b = body as Record<string, unknown>
  if (b.kind === 'brand') {
    if (typeof b.brandId !== 'number') {
      throw new Error('brand seed must carry a numeric brandId')
    }
    return { kind: 'brand', brandId: b.brandId }
  }
  if (b.kind === 'freeform') {
    if (typeof b.query !== 'string') {
      throw new Error('freeform seed must carry a string query')
    }
    return { kind: 'freeform', query: b.query }
  }
  throw new Error(`unknown seed kind: ${String(b.kind)}`)
}
