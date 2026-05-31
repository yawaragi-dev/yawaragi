/**
 * Wrapper for `pnpm test:integration`. Skips cleanly (exit 0) when Docker
 * isn't available locally; otherwise execs vitest as before.
 *
 * Why: the testcontainer global setup throws "Could not find a working
 * container runtime strategy" when Docker isn't running, and vitest then
 * reports "No test files found" because globalSetup aborted before
 * discovery — a doubly-misleading message for a single root cause. This
 * wrapper turns the same condition into a clear human-readable skip.
 *
 * CI always has Docker available (`services: docker` in the GHA workflow),
 * so this preflight only ever short-circuits on local boxes that CLAUDE.md
 * explicitly says "rely on CI". It also keeps `pnpm verify` advancing past
 * the integration step on those boxes instead of stalling the whole chain.
 */
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)

// `docker info` is the canonical "is the daemon reachable from here?"
// probe — it exits non-zero on missing binary, missing socket, missing
// permissions, or stopped daemon, which are exactly the cases where
// testcontainers will also fail. 5s is generous; the local socket call
// is sub-100ms on a healthy machine.
async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileP('docker', ['info'], { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

async function main(): Promise<number> {
  // Allow CI / explicit local opt-out without modifying this file.
  if (process.env.SKIP_INTEGRATION_TESTS === '1') {
    process.stdout.write('[skip] SKIP_INTEGRATION_TESTS=1 — integration suite skipped.\n')
    return 0
  }

  if (!(await dockerAvailable())) {
    process.stdout.write(
      '[skip] Integration tests skipped — Docker not available locally.\n' +
        '       CI runs them automatically. To run locally, start Docker Desktop\n' +
        '       or your OS equivalent and re-run `pnpm test:integration`.\n',
    )
    return 0
  }

  return await new Promise<number>((resolve) => {
    const child = spawn(
      'vitest',
      ['run', '--config', 'vitest.integration.config.mts', ...process.argv.slice(2)],
      { stdio: 'inherit' },
    )
    child.on('exit', (code) => resolve(code ?? 1))
    child.on('error', () => resolve(1))
  })
}

void main().then((code) => process.exit(code))
