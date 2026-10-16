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
  // Next traces sharp (and its ~19 MB libvips binary) into every function for
  // self-hosted image optimisation. On Vercel `/_next/image` is served by
  // Vercel's image service, not by our functions, so the copy in each bundle
  // is dead weight that counts toward Functions Storage per deployment. The
  // Next.js docs' own example of this option excludes exactly sharp.
  outputFileTracingExcludes: {
    '/*': [
      'node_modules/sharp/**/*',
      'node_modules/@img/**/*',
      'node_modules/.pnpm/sharp@*/**/*',
      'node_modules/.pnpm/@img+*/**/*',
    ],
  },
}

export default withNextIntl(nextConfig)
