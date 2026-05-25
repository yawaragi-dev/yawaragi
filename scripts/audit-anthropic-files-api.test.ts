import { describe, expect, it } from 'vitest'
import { auditSource, FORBIDDEN_PATTERNS } from './audit-anthropic-files-api'

describe('auditSource', () => {
  it('flags a raw Anthropic Files API URL', () => {
    const violations = auditSource(
      [
        '// Some module file',
        "const url = 'https://api.anthropic.com/v1/files'",
        'export {}',
      ].join('\n'),
      '/repo/src/lib/ai/scan.ts',
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      line: 2,
      pattern: 'anthropic-files-url',
    })
  })

  it('flags the SDK files.create() method', () => {
    const violations = auditSource(
      [
        "import Anthropic from '@anthropic-ai/sdk'",
        'const client = new Anthropic()',
        'const file = await client.files.create({ purpose: "vision" })',
      ].join('\n'),
      '/repo/src/lib/ai/scan.ts',
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({
      line: 3,
      pattern: 'anthropic-sdk-files-method',
    })
  })

  it('flags every SDK files method (upload/retrieve/list/delete)', () => {
    for (const method of ['create', 'upload', 'retrieve', 'list', 'delete']) {
      const violations = auditSource(`await client.files.${method}({ foo: 1 })`, '/repo/test.ts')
      expect(violations, `should flag client.files.${method}(...)`).toHaveLength(1)
    }
  })

  it('does not flag inline base64 via /v1/messages (the allowed path)', () => {
    const violations = auditSource(
      [
        "import { generateText } from 'ai'",
        "import { anthropic } from '@ai-sdk/anthropic'",
        "const result = await generateText({",
        "  model: anthropic('claude-opus-4-7'),",
        "  messages: [{ role: 'user', content: [{ type: 'image', image: imageBytes }] }],",
        '})',
      ].join('\n'),
      '/repo/src/lib/ai/scan.ts',
    )
    expect(violations).toEqual([])
  })

  it('does not flag passing references to "files" not via the method-call pattern', () => {
    const violations = auditSource(
      [
        'const files = [1, 2, 3]',
        'const x = files.map((f) => f + 1)',
        "console.log('files are ok')",
      ].join('\n'),
      '/repo/src/test.ts',
    )
    expect(violations).toEqual([])
  })

  it('catches multiple violations across lines', () => {
    const violations = auditSource(
      [
        "const url = 'api.anthropic.com/v1/files'",
        'await client.files.create({})',
      ].join('\n'),
      '/repo/test.ts',
    )
    expect(violations).toHaveLength(2)
  })

  it('reports the column of the matched substring', () => {
    const violations = auditSource(
      "    const u = 'https://api.anthropic.com/v1/files'",
      '/repo/test.ts',
    )
    expect(violations[0].column).toBeGreaterThan(1)
  })

  it('exposes FORBIDDEN_PATTERNS for downstream consumers', () => {
    expect(FORBIDDEN_PATTERNS.map((p) => p.name).sort()).toEqual([
      'anthropic-files-url',
      'anthropic-sdk-files-method',
    ])
  })
})
