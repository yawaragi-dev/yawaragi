import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FORBIDDEN_COPY } from '../src/lib/legal/forbidden-copy'

export interface Violation {
  jsonPath: string
  phrase: string
  value: string
}

type MessageNode = string | { [key: string]: MessageNode }

export function auditCatalogue(
  node: MessageNode,
  forbidden: ReadonlyArray<string>,
  prefix: string[] = [],
): Violation[] {
  if (typeof node === 'string') {
    const lower = node.toLowerCase()
    const out: Violation[] = []
    for (const phrase of forbidden) {
      if (lower.includes(phrase.toLowerCase())) {
        out.push({ jsonPath: prefix.join('.'), phrase, value: node })
      }
    }
    return out
  }

  const out: Violation[] = []
  for (const [key, child] of Object.entries(node)) {
    out.push(...auditCatalogue(child as MessageNode, forbidden, [...prefix, key]))
  }
  return out
}

function formatViolations(file: string, violations: Violation[]): string {
  return violations
    .map(
      (v) =>
        `  ${file}  ${v.jsonPath}\n    matched: ${JSON.stringify(v.phrase)}\n    in:      ${JSON.stringify(v.value)}`,
    )
    .join('\n\n')
}

function main(): number {
  const repoRoot = resolve(import.meta.dirname, '..')
  const targets = ['messages/en.json', 'messages/de.json']

  let totalViolations = 0
  for (const relative of targets) {
    const absolute = resolve(repoRoot, relative)
    const raw = readFileSync(absolute, 'utf8')
    const parsed = JSON.parse(raw) as MessageNode
    const violations = auditCatalogue(parsed, FORBIDDEN_COPY)
    if (violations.length > 0) {
      console.error(`\n✘ ${relative} contains ${violations.length} forbidden phrase(s):\n`)
      console.error(formatViolations(relative, violations))
      totalViolations += violations.length
    } else {
      console.log(`✓ ${relative} clean`)
    }
  }

  if (totalViolations > 0) {
    console.error(
      `\n${totalViolations} violation(s) found. JMStV §6(5) forbids promotional copy in alcohol-adjacent UI.\n`,
    )
    return 1
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
