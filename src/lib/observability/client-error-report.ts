import {
  CLIENT_ERROR_REPORT_MAX_BYTES,
  ClientErrorReportSchema,
} from '@/lib/schemas/client-error-report'
import { logFailure, oneLine } from '@/lib/observability/log-failure'

/**
 * A path as a pattern: the query dropped, and every segment holding a digit —
 * a brand id, an own bottling's UUID — replaced by `:id`. Locale and screen
 * names have no digits, so `/en/sake/123` becomes `/en/sake/:id` and
 * `/de/collection` stays as it is.
 */
export function pathPattern(path: string): string {
  const bare = path.split(/[?#]/, 1)[0] ?? ''
  return bare
    .split('/')
    .map((segment) => (/\d/.test(segment) ? ':id' : segment))
    .join('/')
}

/**
 * `POST /api/client-error`: the app's error screen reports a crash that
 * happened in the browser, where nothing else would ever see it. Logs one
 * line (`log-failure.ts`) and answers 204. Reads no cookie and no header; the
 * body is a message and a path, size-capped and schema-checked.
 */
export async function handleClientErrorReport(request: Request): Promise<Response> {
  const text = await request.text()
  if (text.length > CLIENT_ERROR_REPORT_MAX_BYTES) return new Response(null, { status: 413 })
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return new Response(null, { status: 400 })
  }
  const parsed = ClientErrorReportSchema.safeParse(body)
  if (!parsed.success) return new Response(null, { status: 400 })

  logFailure({
    where: 'client render',
    route: oneLine(pathPattern(parsed.data.path), 200),
    message: oneLine(parsed.data.message),
  })
  return new Response(null, { status: 204 })
}
