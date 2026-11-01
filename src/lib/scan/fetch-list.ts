import type { Locale } from '@/i18n/routing'
import type { ListActionState } from './list-action-state'

/**
 * Sends §7's list read to `POST /{locale}/scan/list`. `signal` ends the
 * request when the visitor leaves the list screen, retakes the photo or the
 * 30 s stop fires; the browser then rejects with an `AbortError`.
 *
 * A server error rejects with a plain `Error` (not the `TypeError` of a lost
 * connection), so the screen shows the error page, as a throwing Server
 * Action did.
 */
export async function fetchList(locale: Locale, formData: FormData, signal: AbortSignal): Promise<ListActionState> {
  const response = await fetch(`/${locale}/scan/list`, { method: 'POST', body: formData, signal })
  if (!response.ok && response.status !== 400) throw new Error(`The list read answered ${response.status}`)
  return (await response.json()) as ListActionState
}
