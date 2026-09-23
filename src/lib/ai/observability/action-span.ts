import 'server-only'

import { startActiveObservation, updateActiveObservation } from '@langfuse/tracing'

/**
 * #287 — the action-level Langfuse span, and the outcome signal that
 * rides on it.
 *
 * # Why this exists
 *
 * Both production incidents in September 2026 were SILENT:
 *
 *   - `/suggest` returned zero suggestions for about a month (#270).
 *     Model drift sent numeric tool args as strings, the retries burned
 *     the step budget, `stopWhen` fired before a final answer, and the
 *     page rendered "no matches". The only trace of it was a
 *     `debugAdd(...)` line — which is a **no-op unless the visitor holds
 *     the debug cookie**. In production nothing recorded it at all.
 *   - The AI SDK 7 migration shipped a prompt shape the SDK rejects at
 *     runtime. Typecheck was clean and 1037 tests passed.
 *
 * `langfuse-trace.ts` already traces each *AI call*. What was missing is
 * the layer above: what the ACTION decided. A tool loop can complete
 * perfectly — four tidy generation spans, sensible token counts — and
 * still hand the visitor an empty list. From the per-call spans alone
 * that is indistinguishable from success.
 *
 * Its own docstring has specified this layer all along ("callers wrap
 * their action body in their own `tracer.startActiveSpan('suggest-action',
 * ...)`"), and no caller ever implemented it. This module is that layer.
 *
 * # Why the outcome is classified at the boundary
 *
 * `suggestAction` has a dozen `return` sites (`invalid_input` ×3,
 * `session_missing`, `rate_limited`, `service_unavailable`, three
 * `error` reasons, `ok`…). Instrumenting each one invites exactly the
 * drift this module exists to catch: the thirteenth return path ships
 * untelemetered and fails silently again.
 *
 * So the outcome is derived ONCE, from the value the action actually
 * returned, by a `classify` function the caller supplies. A new return
 * path is covered the moment it exists — at worst it classifies as
 * unknown, which is still visible.
 *
 * # Not payloads
 *
 * This records metadata only — outcome names, counts, ratios. Raw
 * prompts and completions stay out of Langfuse per ADR-0009's "redacted
 * prompts + completions" posture; `recordInputs` / `recordOutputs` in
 * `langfuse-trace.ts` keep defaulting to `false` and this module does
 * not touch them.
 */

/**
 * Langfuse severity. `ERROR` and `WARNING` are what make a silent
 * failure filterable in the Langfuse UI — the whole point of #287 — so
 * classifiers should reach for them rather than burying a failure in
 * `DEFAULT`.
 */
export type ActionOutcomeLevel = 'DEFAULT' | 'WARNING' | 'ERROR'

export interface ActionOutcome {
  /**
   * Stable, machine-readable outcome slug — `ok`, `no_match`,
   * `step_budget_exhausted`, `rate_limited`. Queried and charted, so
   * treat it like an enum: renaming one breaks existing Langfuse
   * filters and dashboards.
   */
  outcome: string
  level?: ActionOutcomeLevel
  /** Human-readable one-liner shown next to the span in Langfuse. */
  statusMessage?: string
  /**
   * Extra attributes for this outcome (counts, ratios, reasons).
   *
   * Unlike `TracedCallContext.metadata` — which Langfuse's
   * `propagateAttributes` restricts to strings, silently dropping
   * anything else — observation metadata is typed
   * `Record<string, unknown>`, so numbers can stay numbers and remain
   * chartable. Keep keys in the established `<area>.<key>` shape.
   */
  metadata?: Record<string, unknown>
}

/**
 * Attach metadata to the action span from inside the action body, for
 * values that only exist part-way through (cache-token counts, the
 * resolved provider, step counts).
 *
 * No-op when there is no active observation — a unit test calling the
 * action directly, or a code path that runs outside `withActionSpan`,
 * must not blow up over telemetry.
 */
export function recordActionMetadata(metadata: Record<string, unknown>): void {
  try {
    updateActiveObservation({ metadata }, { asType: 'span' })
  } catch {
    // Telemetry must never take the surface down with it. A failure
    // here means a missing attribute in Langfuse, which is strictly
    // better than a 500 on the user's suggestion request.
  }
}

/**
 * Run an action inside a named Langfuse span, recording what it decided.
 *
 * The AI-call spans created by `tracedGenerateText` / `tracedGenerateObject`
 * nest underneath automatically — they join the active OTel context —
 * so one Langfuse trace shows the action and every model call it made.
 *
 * `classify` receives the action's own return value; it never sees a
 * thrown error. A throw is recorded as `outcome: 'threw'` at `ERROR`
 * and then rethrown unchanged, so error handling upstream is unaffected.
 */
export async function withActionSpan<T>(
  args: {
    /** kebab-case action name, e.g. `suggest-action`, `scan-action`. */
    name: string
    /** Attributes known before the action runs (seed kind, locale). */
    metadata?: Record<string, unknown>
    classify: (result: T) => ActionOutcome
  },
  run: () => Promise<T>,
): Promise<T> {
  return startActiveObservation(
    args.name,
    async () => {
      let result: T
      try {
        result = await run()
      } catch (error) {
        updateActiveObservation(
          {
            level: 'ERROR',
            statusMessage: error instanceof Error ? error.message : String(error),
            metadata: { 'action.outcome': 'threw' },
          },
          { asType: 'span' },
        )
        throw error
      }

      // Classification is deliberately inside the try-free path but
      // still guarded: a classifier bug must not convert a successful
      // action into a 500.
      try {
        const { outcome, level, statusMessage, metadata } = args.classify(result)
        updateActiveObservation(
          {
            level: level ?? 'DEFAULT',
            ...(statusMessage === undefined ? {} : { statusMessage }),
            metadata: { ...args.metadata, ...metadata, 'action.outcome': outcome },
          },
          { asType: 'span' },
        )
      } catch {
        // Same reasoning as `recordActionMetadata`.
      }

      return result
    },
    { asType: 'span' },
  ) as Promise<T>
}
