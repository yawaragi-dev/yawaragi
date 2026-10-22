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
  { timeoutMs, isOnline }: { timeoutMs: number | null; isOnline: () => boolean },
): Promise<Settled<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<Settled<T>>((resolve) => {
    if (timeoutMs !== null) timer = setTimeout(() => resolve({ ok: false, failure: 'timed_out' }), timeoutMs)
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

/**
 * A Server Action that saves something (a rating, a note, a cellar bottle),
 * made to answer `{ status: 'unavailable' }` — the "Couldn't save" every
 * caller already shows — when the network loses it, instead of throwing to
 * the error page and taking the tapped star with it (design question S6).
 *
 * No time limit: a save that reached the server may have been made even if
 * its answer is slow, and calling it lost would invite a second tap and a
 * second tasting.
 */
export function reachable<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | { status: 'unavailable' }> {
  return async (...args) => {
    const settled = await settleRequest(action(...args), { timeoutMs: null, isOnline: browserIsOnline })
    return settled.ok ? settled.value : { status: 'unavailable' }
  }
}

/** For `useSyncExternalStore`: re-read `navigator.onLine` when the browser says it changed. */
export function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}
