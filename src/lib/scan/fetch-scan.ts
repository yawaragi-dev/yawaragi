import type { Locale } from '@/i18n/routing'
import type { ScanActionState } from './scan-action-state'

/**
 * Sends one scan to `POST /{locale}/scan/read`. `signal` ends the request
 * when the visitor cancels or the 30 s stop fires; the browser then rejects
 * with an `AbortError`.
 *
 * A server error rejects with a plain `Error` (not the `TypeError` of a lost
 * connection), so the screen shows the error page, as a throwing Server
 * Action did.
 */
export async function fetchScan(locale: Locale, formData: FormData, signal: AbortSignal): Promise<ScanActionState> {
  const response = await fetch(`/${locale}/scan/read`, { method: 'POST', body: formData, signal })
  if (!response.ok && response.status !== 400) throw new Error(`The scan answered ${response.status}`)
  return (await response.json()) as ScanActionState
}
