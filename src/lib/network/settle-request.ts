/**
 * Why a request from the browser did not come back with an answer — the two
 * cases a visitor can do something about (#464, design question S).
 *
 * - `offline`: it never left the phone, or the phone says it has no
 *   connection. Nothing reached the server, so nothing was spent.
 * - `timed_out`: no answer within the limit. It may have reached the server
 *   and been worked on; the answer is lost either way.
 */
export type ConnectionFailure = 'offline' | 'timed_out'

export type Settled<T> = { ok: true; value: T } | { ok: false; failure: ConnectionFailure }

/**
 * Waits for a Server Action (or any request) and turns a network failure into
 * a value, so a screen can say "no connection" in place instead of ending on
 * the error page and losing what the visitor gave it (a photo, a star).
 *
 * Only the network is caught. A browser that cannot send a request rejects
 * with a `TypeError` ("Failed to fetch", "NetworkError when attempting to
 * fetch resource.", "Load failed" — the wording differs per engine, the type
 * does not); anything else while the phone reports a connection is the
 * server's own error, and it is rethrown so the error page and the server log
 * keep seeing it. `isOnline` is `navigator.onLine`: its `false` is reliable,
 * its `true` is not (a captive Wi-Fi counts as online), so it only ever turns
 * a failure into `offline`, never a success into one.
 */
export async function settleRequest<T>(
  request: Promise<T>,
  { timeoutMs, isOnline }: { timeoutMs: number; isOnline: () => boolean },
): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<Settled<T>>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, failure: 'timed_out' }), timeoutMs)
  })
  const answered = request.then(
    (value): Settled<T> => ({ ok: true, value }),
    (error: unknown): Settled<T> => {
      if (error instanceof TypeError || !isOnline()) return { ok: false, failure: 'offline' }
      throw error
    },
  )
  try {
    return await Promise.race([answered, timedOut])
  } finally {
    clearTimeout(timer)
  }
}

/** `navigator.onLine`, read where there is a navigator. */
export function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}
