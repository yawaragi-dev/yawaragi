// The light check CI runs on every pull request, docs-only ones included
// (ci.yml's `changes` job): the PRs that skip the full Verify suite are the
// ones that only touch Markdown — skills, CLAUDE.md, docs/ — and #530 showed
// those can still break something an agent relies on.
//
//   1. every `.claude/skills/*/SKILL.md` opens with YAML frontmatter that
//      has a non-empty `name` and `description` (what the skill loader reads);
//   2. no changed test file adds a `.only(` (`test.only`, `it.only`,
//      `describe.only`), which would quietly shrink a suite to one test.
//
// Plain Node, no dependencies, so CI runs it without `pnpm install`
// (`node scripts/docs-check.ts`; Node 22 strips the types itself).
//
//   pnpm docs:check                 # diff against origin/main
//   pnpm docs:check --base <ref>    # diff against another ref
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export interface DocsCheckProblem {
  file: string
  message: string
}

/** Problems with one SKILL.md's frontmatter; empty when it is fine. */
export function checkSkillFrontmatter(content: string, file: string): DocsCheckProblem[] {
  const lines = content.replace(/^﻿/, '').split(/\r?\n/)
  if (lines[0]?.trim() !== '---') {
    return [{ file, message: 'does not open with YAML frontmatter (a `---` line)' }]
  }
  const closing = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (closing === -1) {
    return [{ file, message: 'frontmatter has no closing `---` line' }]
  }
  const keys = new Map<string, string>()
  for (const line of lines.slice(1, closing)) {
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(line)
    if (match) keys.set(match[1], match[2].trim())
  }
  const problems: DocsCheckProblem[] = []
  for (const key of ['name', 'description']) {
    const value = keys.get(key)
    // A YAML block scalar (`description: >` / `|`) carries its text on the
    // lines below, so the marker alone counts as a value.
    if (value === undefined || value === '' || value === '""' || value === "''") {
      problems.push({ file, message: `frontmatter has no \`${key}\`` })
    }
  }
  return problems
}

const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^|\/)e2e\/.*\.[cm]?[jt]sx?$/
// Anchored to the start of the line, where a test or suite call sits, so a
// `.only(` inside a string (this script's own test fixtures) is not one.
const ONLY_CALL = /^\s*(test|it|describe)(\.(describe|skip|concurrent|serial|parallel|sequential))*\.only\s*\(/

/**
 * Test files whose added lines call `.only(`, from a unified diff
 * (`git diff --unified=0`).
 */
export function findAddedOnly(diff: string): DocsCheckProblem[] {
  const problems: DocsCheckProblem[] = []
  let file: string | null = null
  let line = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).replace(/^b\//, '')
      file = path === '/dev/null' || !TEST_FILE.test(path) ? null : path
      continue
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (hunk) {
      line = Number(hunk[1])
      continue
    }
    if (raw.startsWith('+')) {
      if (file && ONLY_CALL.test(raw.slice(1))) {
        problems.push({ file, message: `line ${line} adds a \`.only(\`, which would run that test alone` })
      }
      line++
    } else if (raw.startsWith(' ')) {
      line++
    }
  }
  return problems
}

function skillFiles(repoRoot: string): string[] {
  const dir = join(repoRoot, '.claude', 'skills')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('.claude', 'skills', entry.name, 'SKILL.md'))
    .filter((file) => existsSync(join(repoRoot, file)))
}

function main(argv: string[]): number {
  const repoRoot = resolve(import.meta.dirname, '..')
  const baseIndex = argv.indexOf('--base')
  const base = baseIndex === -1 ? 'origin/main' : argv[baseIndex + 1]
  if (!base) {
    console.error('docs-check: --base needs a git ref')
    return 2
  }

  const problems: DocsCheckProblem[] = []
  const skills = skillFiles(repoRoot)
  for (const file of skills) {
    problems.push(...checkSkillFrontmatter(readFileSync(join(repoRoot, file), 'utf8'), file))
  }

  let diff: string
  try {
    diff = execFileSync('git', ['diff', '--unified=0', '--no-color', `${base}...HEAD`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    console.error(`docs-check: could not diff against ${base} (fetch it, or pass --base <ref>)`)
    return 2
  }
  problems.push(...findAddedOnly(diff))

  if (problems.length > 0) {
    console.error(`\n✘ docs check: ${problems.length} problem(s):\n`)
    for (const { file, message } of problems) console.error(`  ${file}: ${message}`)
    console.error('')
    return 1
  }
  console.log(`✓ docs check: ${skills.length} skill(s) have name + description; no added .only( against ${base}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)))
}
