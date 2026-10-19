import { z } from 'zod'

/**
 * What the app's error screen sends when a page crashed IN THE BROWSER
 * (`/api/client-error`). Anonymous by construction — no user, no session, no
 * content of the page: the error's message and the path it happened on, which
 * the server turns into a pattern (`/en/sake/:id`) before logging.
 *
 * Lawful basis: legitimate interest (ADR-0009 RoPA, "Crash reports") — keeping
 * the app working. Nothing in it identifies a person; it is logged to Vercel's
 * runtime log and kept as long as that log is.
 */
export const ClientErrorReportSchema = z.object({
  message: z.string().min(1).max(1000),
  path: z.string().min(1).max(500),
})

export type ClientErrorReport = z.infer<typeof ClientErrorReportSchema>

/** Larger bodies are refused unread: a report is a sentence and a path. */
export const CLIENT_ERROR_REPORT_MAX_BYTES = 2048
