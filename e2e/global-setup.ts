import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { FullConfig } from '@playwright/test'

/**
 * Warm the routes that export `generateStaticParams`, one at a time, before
 * any test runs (#528).
 *
 * The first time `next dev` (16.4) renders such a route it reads
 * `.next/dev/prerender-manifest.json`, adds the route and writes the file back
 * with a plain `fs.promises.writeFile` (`next-dev-server.js`, unlike the
 * Turbopack manifests, which are written atomically). Two of those first
 * renders at once — two workers opening the two offline routes — can both
 * truncate the file and write over each other, leaving the shorter JSON with
 * the longer one's tail behind it. From then on every request fails with
 * "Unexpected non-whitespace character after JSON at position N", which took
 * out 74 tests in one CI run. Rendered once each, in turn, the manifest is
 * written serially; after that Next only writes it when its content changes,
 * and it no longer does.
 */
export const STATIC_PARAMS_ROUTES = [
  '/api/offline/en',
  '/api/offline/en/collection',
  '/api/offline/de',
  '/api/offline/de/collection',
] as const

/** The route files under `src/app` that export `generateStaticParams`. */
export const STATIC_PARAMS_ROUTE_FILES = [
  'api/offline/[locale]/route.ts',
  'api/offline/[locale]/collection/route.ts',
] as const

function filesExportingStaticParams(dir: string, root = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesExportingStaticParams(full, root)
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return /export\s+(async\s+)?(function|const)\s+generateStaticParams\b/.test(readFileSync(full, 'utf8'))
      ? [path.relative(root, full).split(path.sep).join('/')]
      : []
  })
}

export default async function globalSetup(config: FullConfig) {
  const found = filesExportingStaticParams(path.join(process.cwd(), 'src/app')).sort()
  const listed = [...STATIC_PARAMS_ROUTE_FILES].sort()
  if (found.join('\n') !== listed.join('\n')) {
    throw new Error(
      `e2e/global-setup.ts warms the routes that export generateStaticParams, and the list is out of date.\n` +
        `Found: ${found.join(', ') || 'none'}\nListed: ${listed.join(', ')}\n` +
        `Update STATIC_PARAMS_ROUTE_FILES and STATIC_PARAMS_ROUTES (#528).`,
    )
  }

  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) return
  for (const route of STATIC_PARAMS_ROUTES) {
    // Sequential on purpose: the point is that no two first renders overlap.
    const res = await fetch(new URL(route, baseURL))
    await res.arrayBuffer()
  }
}
