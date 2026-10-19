/** A step slower than this is worth a log line; faster ones say nothing. */
export const SLOW_STEP_MS = 300

/**
 * Times one step of a page render and logs it when it is slow, as one line
 * tagged `[yawaragi:slow]` with the step's fixed name and its milliseconds —
 * nothing about the visitor (ADR-0009, as `log-failure.ts`). Vercel's
 * per-route timings need a paid plan; these lines are what tells which part
 * of a slow screen took the time, in the runtime log.
 */
export async function timeStep<T>(where: string, step: () => Promise<T>, slowMs: number = SLOW_STEP_MS): Promise<T> {
  const started = performance.now()
  try {
    return await step()
  } finally {
    const ms = Math.round(performance.now() - started)
    if (ms >= slowMs) console.warn('[yawaragi:slow]', JSON.stringify({ where, ms }))
  }
}
