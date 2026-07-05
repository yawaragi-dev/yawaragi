import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Per-request server-side trace accumulator for debug mode. A
 * `DebugLog` is created at the entry of a request handler (Server
 * Action, route handler, etc.) when `isDebugEnabledFromCookies(...)`
 * is true, then attached to the response so the client `<DebugPanel
 * />` can render it.
 *
 * Modules deep in the call chain — vision provider, Sakenowa lookup,
 * rate-limit middleware — append events via `getCurrentDebugLog()`
 * without taking the log as an explicit parameter. This keeps the
 * production signatures of those modules clean: the optional
 * `AsyncLocalStorage` peek is a no-op when debug is off and a single
 * push when debug is on.
 *
 * Why AsyncLocalStorage rather than threading a `log` parameter:
 *   - The vision-provider seam (`VisionProvider.extractLabel`) is the
 *     project's stable contract for swapping providers. Adding a
 *     mandatory `log` parameter would propagate to every implementation
 *     and to the registry. Keeping it implicit lets the seam stay
 *     narrow.
 *   - Same reasoning for `findSakeByExtraction` and any future tool /
 *     service the scan-action calls.
 *   - Server Actions run on Node.js (Edge runtime is opt-in per route
 *     and not used by the scan action). `AsyncLocalStorage` works
 *     reliably here.
 */

export type DebugEventSource =
  | 'ScanForm'
  | 'RateLimit'
  | 'Vision'
  | 'Sakenowa'
  | 'ScanAction'
  | 'SuggestAction'
  | 'MCP'
  | 'Hydrate'

export type DebugEventLevel = 'info' | 'warn' | 'error'

export interface DebugEvent {
  /**
   * Wall-clock milliseconds since the log was created. Relative time
   * is more useful than absolute timestamps in a per-request trace
   * (which is what the panel renders) and avoids leaking server clock
   * skew through the response.
   */
  tMs: number
  source: DebugEventSource
  level: DebugEventLevel
  message: string
  /**
   * Optional structured data — serialised verbatim into the response.
   * Implementations should keep this small (no full images, no full
   * model responses); the panel is a debug surface, not a log
   * aggregator.
   */
  data?: Record<string, unknown>
}

export class DebugLog {
  readonly #startMs: number
  readonly #events: DebugEvent[] = []

  constructor() {
    this.#startMs = Date.now()
  }

  add(
    source: DebugEventSource,
    message: string,
    data?: Record<string, unknown>,
    level: DebugEventLevel = 'info',
  ): void {
    this.#events.push({
      tMs: Date.now() - this.#startMs,
      source,
      level,
      message,
      data,
    })
  }

  warn(source: DebugEventSource, message: string, data?: Record<string, unknown>): void {
    this.add(source, message, data, 'warn')
  }

  error(source: DebugEventSource, message: string, data?: Record<string, unknown>): void {
    this.add(source, message, data, 'error')
  }

  /**
   * Snapshot the accumulated events as a plain serialisable array,
   * suitable for attaching to a Server Action's tagged-union result.
   */
  toArray(): ReadonlyArray<DebugEvent> {
    return [...this.#events]
  }
}

const debugLogStorage = new AsyncLocalStorage<DebugLog | undefined>()

/**
 * Run a callback with `log` as the current per-request debug log.
 * Modules deeper in the call chain see this log via
 * `getCurrentDebugLog()`. Passing `undefined` is a deliberate way to
 * keep the existing storage in scope (used when debug is off — every
 * `getCurrentDebugLog()` returns `undefined` and appends are no-ops).
 */
export function runWithDebugLog<R>(
  log: DebugLog | undefined,
  fn: () => Promise<R> | R,
): Promise<R> | R {
  return debugLogStorage.run(log, fn)
}

/**
 * Read the debug log scoped to the current async context. Returns
 * `undefined` when debug mode is off or when the call chain originated
 * outside a `runWithDebugLog(...)` scope (background jobs, etc.).
 */
export function getCurrentDebugLog(): DebugLog | undefined {
  return debugLogStorage.getStore()
}

/**
 * Convenience for modules deep in the stack: append an event if a
 * debug log is in scope, otherwise no-op. Cheaper than the explicit
 * pattern `getCurrentDebugLog()?.add(...)` at the call site.
 */
export function debugAdd(
  source: DebugEventSource,
  message: string,
  data?: Record<string, unknown>,
  level: DebugEventLevel = 'info',
): void {
  getCurrentDebugLog()?.add(source, message, data, level)
}
