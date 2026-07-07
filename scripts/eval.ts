/**
 * `pnpm eval <suite>` dispatcher.
 *
 * Suites: `suggest-jp` (Phase 4) and `label-scan-jp` (Phase 3 / S5 #110).
 * The dispatcher is a thin router — each suite lives in its own runner file
 * with its own data + metrics so a label-scan run doesn't share state with a
 * suggest run.
 *
 * Not part of `pnpm test` / `pnpm verify`. Eval runs are informational
 * — they compare candidate models / providers / tool-sets, not gate merges.
 *
 * # `--conditions=react-server`
 *
 * The `eval` npm script runs tsx with `--conditions=react-server`. The
 * `label-scan-jp` runner imports the `server-only` vision registry directly
 * to call `VisionProvider.extractLabel` (label-scan is a single-method seam,
 * not a whole server action like suggest, which goes over HTTP instead). The
 * condition resolves the `server-only` marker to its empty shim — exactly as
 * the Next.js RSC bundler does in production — instead of throwing. It is a
 * no-op for the `suggest-jp` runner, whose runtime imports are the type-only
 * suggest state + the Zod-validated data files.
 *
 * Usage:
 *   pnpm eval suggest-jp
 *   pnpm eval label-scan-jp
 */

const AVAILABLE_SUITES = ['suggest-jp', 'label-scan-jp'] as const

async function main() {
  const suite = process.argv[2]
  if (!suite) {
    console.error('Usage: pnpm eval <suite>')
    console.error(`Available suites: ${AVAILABLE_SUITES.join(', ')}`)
    process.exit(1)
  }

  switch (suite) {
    case 'suggest-jp':
      await import('./eval-suggest-jp')
      break
    case 'label-scan-jp':
      await import('./eval-label-scan-jp')
      break
    default:
      console.error(`Unknown suite: ${suite}`)
      console.error(`Available suites: ${AVAILABLE_SUITES.join(', ')}`)
      process.exit(1)
  }
}

main().catch((err) => {
  console.error('eval dispatcher: fatal error', err)
  process.exit(1)
})
