/**
 * What Next checks for a Server Action, for a route handler that stands in
 * for one (the label scan, §7's list read): a POST whose `Origin` names
 * another host is refused, so no page elsewhere can spend a visitor's scans
 * (or ours). A request with no `Origin` passes, as it does for a Server
 * Action.
 */
export function isCrossSite(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return false
  try {
    return new URL(origin).host !== new URL(request.url).host
  } catch {
    // `Origin: null` (a sandboxed frame, a file) or anything unparseable.
    return true
  }
}
