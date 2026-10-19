import { handleClientErrorReport } from '@/lib/observability/client-error-report'

/**
 * `POST /api/client-error` — the error screen's anonymous crash report (a
 * message and a path, logged as a pattern). See `client-error-report.ts`.
 */
export const dynamic = 'force-dynamic'

export function POST(request: Request): Promise<Response> {
  return handleClientErrorReport(request)
}
