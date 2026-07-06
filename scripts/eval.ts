/**
 * `pnpm eval <suite>` dispatcher.
 *
 * Today: one suite, `suggest-jp`. Future: `label-scan-jp` and any
 * further eval directories under `evals/*`. The dispatcher is a
 * thin router — each suite lives in its own runner file with its own
 * data + metrics so a Phase 3 label-scan run doesn't share state
 * with a Phase 4 suggest run.
 *
 * Not part of `pnpm test` / `pnpm verify`. Eval runs are informational
 * — they compare candidate models / tool-sets, not gate merges.
 *
 * Usage:
 *   pnpm eval suggest-jp
 */

async function main() {
  const suite = process.argv[2]
  if (!suite) {
    console.error('Usage: pnpm eval <suite>')
    console.error('Available suites: suggest-jp')
    process.exit(1)
  }

  switch (suite) {
    case 'suggest-jp':
      await import('./eval-suggest-jp')
      break
    default:
      console.error(`Unknown suite: ${suite}`)
      console.error('Available suites: suggest-jp')
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('eval dispatcher: fatal error', err)
  process.exit(1)
})
