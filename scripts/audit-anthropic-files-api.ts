import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

export interface FilesApiViolation {
  file: string
  line: number
  column: number
  pattern: string
  excerpt: string
}

export const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  {
    name: 'anthropic-files-url',
    regex: /api\.anthropic\.com\/v1\/files/i,
  },
  {
    name: 'anthropic-sdk-files-method',
    regex: /\.files\.(create|upload|delete|retrieve|list)\s*\(/,
  },
]

export function auditSource(content: string, file: string): FilesApiViolation[] {
  const violations: FilesApiViolation[] = []
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { name, regex } of FORBIDDEN_PATTERNS) {
      const match = regex.exec(line)
      if (match) {
        violations.push({
          file,
          line: i + 1,
          column: match.index + 1,
          pattern: name,
          excerpt: line.trim(),
        })
      }
    }
  }
  return violations
}

function shouldScanPath(absolutePath: string): boolean {
  if (!absolutePath.endsWith('.ts') && !absolutePath.endsWith('.tsx')) return false
  if (absolutePath.endsWith('.test.ts') || absolutePath.endsWith('.test.tsx')) return false
  if (absolutePath.includes('audit-anthropic-files-api')) return false
  return true
}

function walkSourceFiles(root: string): string[] {
  const found: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
        stack.push(full)
      } else if (stat.isFile() && shouldScanPath(full)) {
        found.push(full)
      }
    }
  }
  return found
}

function formatViolations(repoRoot: string, violations: FilesApiViolation[]): string {
  return violations
    .map((v) => {
      const rel = relative(repoRoot, v.file)
      return `  ${rel}:${v.line}:${v.column}  [${v.pattern}]\n    ${v.excerpt}`
    })
    .join('\n\n')
}

function main(): number {
  const repoRoot = resolve(import.meta.dirname, '..')
  const sourceRoots = [join(repoRoot, 'src'), join(repoRoot, 'scripts')]
  const allViolations: FilesApiViolation[] = []
  let scannedFiles = 0

  for (const root of sourceRoots) {
    const files = walkSourceFiles(root)
    scannedFiles += files.length
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      allViolations.push(...auditSource(content, file))
    }
  }

  if (allViolations.length > 0) {
    console.error(`\n✘ Anthropic Files API audit: ${allViolations.length} violation(s) in ${scannedFiles} file(s):\n`)
    console.error(formatViolations(repoRoot, allViolations))
    console.error(
      `\nAnthropic's Files API is NOT ZDR-eligible and retains uploaded files indefinitely until explicitly deleted.\nYawaragi's vision/label-scan flow must use inline base64 via /v1/messages instead.\nSee CLAUDE.md § "Anthropic Files API ban" and issue #59.\n`,
    )
    return 1
  }
  console.log(`✓ Anthropic Files API audit: ${scannedFiles} source file(s) clean`)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
