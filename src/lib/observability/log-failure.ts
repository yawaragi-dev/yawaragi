/**
 * One line in the runtime log (Vercel → Logs) for a failure, carrying only
 * what says WHAT broke — never who it broke for. GDPR (ADR-0009): no user id,
 * no cookie, no request body, no journal or cellar contents. What goes in:
 *
 * - `where`: a fixed label chosen by the caller ("collection action",
 *   "request", "client render") or a route PATTERN (`/[locale]/sake/[brandId]`),
 *   never a concrete URL;
 * - the error's `name`, its `code` when it has one (pg's `XX000`, Node's
 *   `ECONNRESET`), its `digest` when Next gave it one;
 * - its message, cut to {@link MAX_MESSAGE} characters and kept to one line.
 *
 * Error messages in this app come from our own code, pg, the Upstash REST
 * client and React — none of which put a user's data in a message. The cut
 * caps the damage if one ever did.
 *
 * Not `server-only`: the client error report route uses it too, and it touches
 * nothing but `console`.
 */
export const MAX_MESSAGE = 300

export interface FailureFields {
  where: string
  route?: string
  name?: string
  code?: string
  digest?: string
  message?: string
}

export function oneLine(value: unknown, max = MAX_MESSAGE): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  // Collapse line breaks and control characters, so a message cannot forge a
  // second log line.
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

/** The anonymous fields of an unknown thrown value. */
export function describeError(error: unknown): Omit<FailureFields, 'where' | 'route'> {
  if (!(error instanceof Error)) return { name: typeof error, message: oneLine(String(error)) }
  const extra = error as Error & { code?: unknown; digest?: unknown }
  return {
    name: oneLine(error.name, 60),
    code: oneLine(typeof extra.code === 'string' ? extra.code : undefined, 40),
    digest: oneLine(typeof extra.digest === 'string' ? extra.digest : undefined, 60),
    message: oneLine(error.message),
  }
}

export function logFailure(fields: FailureFields): void {
  const clean = Object.fromEntries(
    Object.entries(fields).filter(([, v]) => typeof v === 'string' && v.length > 0),
  )
  console.error('[yawaragi:failure]', JSON.stringify(clean))
}
