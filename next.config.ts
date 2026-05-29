import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

// Agent worktrees live at `.claude/worktrees/*` inside this repo and each
// carries its own pnpm-workspace.yaml. Without an explicit project root,
// Next.js' multi-lockfile detection picks the wrong workspace and can
// serve the wrong files in dev / trace the wrong tree at build.
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: { root: PROJECT_ROOT },
  outputFileTracingRoot: PROJECT_ROOT,
}

export default withNextIntl(nextConfig)
