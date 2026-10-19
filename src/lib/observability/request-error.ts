import type { Instrumentation } from 'next'
import { describeError, logFailure } from '@/lib/observability/log-failure'

/**
 * `onRequestError` (instrumentation.ts): one log line for every error Next
 * catches while rendering a page, handling a route or running a Server Action.
 *
 * Next already prints a render error with its digest; what it does not print
 * is WHICH route and what kind of request — a first load, the `.rsc` payload
 * a `router.refresh()` fetches, or an action. That is what tells "the page
 * broke when it was opened" from "the page broke when a delete refreshed it".
 *
 * Logged: the route pattern (`/[locale]/sake/[brandId]`, never the concrete
 * path, which can carry an own bottling's id), the request kind and method,
 * and the error's name, code, digest and message (see `log-failure.ts`).
 * Not logged: the URL, query, headers, cookies, body, user.
 */
export function reportRequestError(
  ...[error, request, context]: Parameters<Instrumentation.onRequestError>
): void {
  logFailure({
    where: `request ${context.routeType}${context.renderSource ? ` (${context.renderSource})` : ''} ${request.method}`,
    route: context.routePath,
    ...describeError(error),
  })
}
