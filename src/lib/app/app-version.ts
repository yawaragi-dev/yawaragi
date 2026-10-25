import 'server-only'

import { version } from '~/package.json'
import { env } from '@/env'

/**
 * Which Yawaragi this is (design v1.10, AA6): About shows
 * "{version} · build {build}", and Account's footer starts with
 * "Yawaragi {version} · build {build}".
 *
 * The version is package.json's, which follows the design snapshot the app
 * is ported to (design v1.10 → 1.10.0; bumped in each snapshot PR).
 * The build is the deployment's commit (Vercel's `VERCEL_GIT_COMMIT_SHA`),
 * cut to seven characters like a short git sha; a local run has no
 * deployment and says "dev".
 */
export interface AppVersion {
  version: string
  build: string
}

export const LOCAL_BUILD = 'dev'

export function shortBuild(commitSha: string | undefined): string {
  return commitSha ? commitSha.slice(0, 7) : LOCAL_BUILD
}

export function appVersion(): AppVersion {
  return { version, build: shortBuild(env.VERCEL_GIT_COMMIT_SHA) }
}
