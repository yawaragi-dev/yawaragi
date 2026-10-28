import { describe, expect, it } from 'vitest'
import { checkSkillFrontmatter, findAddedOnly } from './docs-check'

const FILE = '.claude/skills/tdd/SKILL.md'

describe('checkSkillFrontmatter', () => {
  it('accepts a skill with a name and a description', () => {
    const content = ['---', 'name: tdd', 'description: Test-driven development.', '---', '', '# TDD'].join('\n')
    expect(checkSkillFrontmatter(content, FILE)).toEqual([])
  })

  it('accepts a description written as a YAML block scalar', () => {
    const content = ['---', 'name: tdd', 'description: >', '  Test-driven', '  development.', '---'].join('\n')
    expect(checkSkillFrontmatter(content, FILE)).toEqual([])
  })

  it('reports a skill with no frontmatter at all', () => {
    expect(checkSkillFrontmatter('# TDD\n\nSome text.', FILE)).toEqual([
      { file: FILE, message: expect.stringContaining('does not open with YAML frontmatter') },
    ])
  })

  it('reports frontmatter that is never closed', () => {
    const content = ['---', 'name: tdd', 'description: x', '# TDD'].join('\n')
    expect(checkSkillFrontmatter(content, FILE)[0].message).toContain('no closing')
  })

  it('reports each missing or empty key', () => {
    const content = ['---', 'name:', 'other: x', '---'].join('\n')
    expect(checkSkillFrontmatter(content, FILE).map((p) => p.message)).toEqual([
      'frontmatter has no `name`',
      'frontmatter has no `description`',
    ])
  })

  it('does not take a key from the body below the frontmatter', () => {
    const content = ['---', 'name: tdd', '---', 'description: in the body'].join('\n')
    expect(checkSkillFrontmatter(content, FILE).map((p) => p.message)).toEqual([
      'frontmatter has no `description`',
    ])
  })
})

function diffOf(path: string, added: string[], start = 10): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${start},0 +${start},${added.length} @@`,
    ...added.map((l) => `+${l}`),
  ].join('\n')
}

describe('findAddedOnly', () => {
  it('reports test.only, it.only and describe.only added to test files, with their line', () => {
    const diff = [
      diffOf('src/lib/foo.test.ts', ["it.only('works', () => {})"], 4),
      diffOf('e2e/home.spec.ts', ["test.only('home', async () => {})"]),
      diffOf('src/components/bar.test.tsx', ["describe.only('Bar', () => {"]),
    ].join('\n')
    expect(findAddedOnly(diff)).toEqual([
      { file: 'src/lib/foo.test.ts', message: expect.stringContaining('line 4') },
      { file: 'e2e/home.spec.ts', message: expect.stringContaining('line 10') },
      { file: 'src/components/bar.test.tsx', message: expect.stringContaining('line 10') },
    ])
  })

  it('reports a chained modifier before .only', () => {
    expect(findAddedOnly(diffOf('e2e/a.spec.ts', ["test.describe.serial.only('x', () => {})"]))).toHaveLength(1)
    expect(findAddedOnly(diffOf('src/a.test.ts', ["it.concurrent.only('x', () => {})"]))).toHaveLength(1)
  })

  it('ignores a removed .only, and one outside a test file', () => {
    const diff = [
      'diff --git a/src/a.test.ts b/src/a.test.ts',
      '--- a/src/a.test.ts',
      '+++ b/src/a.test.ts',
      '@@ -3,1 +3,1 @@',
      "-it.only('x', () => {})",
      "+it('x', () => {})",
      diffOf('docs/testing.md', ["Never commit `it.only('x')`."]),
      diffOf('scripts/docs-check.ts', ['const ONLY = /it.only\\s*\\(/']),
    ].join('\n')
    expect(findAddedOnly(diff)).toEqual([])
  })

  it('reports an indented .only, and ignores one inside a string', () => {
    expect(findAddedOnly(diffOf('src/a.test.ts', ["  it.only('nested', () => {})"]))).toHaveLength(1)
    expect(findAddedOnly(diffOf('src/a.test.ts', ["  expect(run(\"it.only('x')\")).toBe(1)"]))).toEqual([])
  })

  it('ignores a skip, which the repo uses for database-gated tests', () => {
    expect(findAddedOnly(diffOf('e2e/a.spec.ts', ["test.skip(!process.env.DATABASE_URL, 'needs a DB')"]))).toEqual([])
  })
})
