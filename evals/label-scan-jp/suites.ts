import type { GroundTruthEntry } from './schemas'

/** What `LABEL_SCAN_EVAL_SUITE` may ask for (#415, README "Suites"). */
export const RUN_SUITES = ['regular', 'full', 'held_out'] as const
export type RunSuite = (typeof RUN_SUITES)[number]

export function isRunSuite(value: string): value is RunSuite {
  return (RUN_SUITES as readonly string[]).includes(value)
}

/**
 * Whether a run of `run` reads a photo marked `suite`. `regular` is part of
 * `full`; a held-out photo is read only when it is asked for by name, so a
 * plain run can never tune on it.
 */
export function inSuite(run: RunSuite, suite: GroundTruthEntry['suite']): boolean {
  if (run === 'held_out') return suite === 'held_out'
  if (run === 'full') return suite !== 'held_out'
  return suite === 'regular'
}
