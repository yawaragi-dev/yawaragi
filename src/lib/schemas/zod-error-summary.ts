import type { ZodError, ZodIssue } from 'zod'

/**
 * Render a Zod error as a single line that names *where* and *what kind*
 * of validation failed — without including the offending value.
 *
 * Logging context is wide: ingestion pipelines, LLM-extraction parsers,
 * cron route handlers. Some of those paths handle user-adjacent data
 * (label scans, future taste profiles). Embedding raw received values in
 * error messages is the lazy way and exactly how PII ends up in log
 * aggregators. We keep `path` + `code` + structural constraints (min /
 * max / expected type) and drop everything else.
 *
 * Caps at `sampleSize` issues; appends `(+N more)` if truncated.
 */
export function summarizeZodError(error: ZodError, opts: { sampleSize?: number } = {}): string {
  const sampleSize = opts.sampleSize ?? 5
  const issues = error.issues
  if (issues.length === 0) return 'no issues'

  const head = issues.slice(0, sampleSize).map(summarizeIssue).join('; ')
  const more = issues.length > sampleSize ? ` (+${issues.length - sampleSize} more)` : ''
  return `${issues.length} issue(s): ${head}${more}`
}

function summarizeIssue(issue: ZodIssue): string {
  const path = issue.path.length === 0 ? '<root>' : issue.path.join('.')
  const detail = describeConstraint(issue)
  return `[${path}] ${issue.code}${detail ? ` (${detail})` : ''}`
}

// Structural constraints we know are non-PII: type expectations, length
// bounds, enum *names*. We never read `issue.received` or the parts of
// `issue.message` that interpolate received values.
function describeConstraint(issue: ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `expected ${(issue as { expected?: string }).expected ?? 'different type'}`
    case 'too_small': {
      const i = issue as { minimum?: number | bigint; type?: string }
      return i.minimum !== undefined ? `expected ${i.type ?? 'value'} >= ${i.minimum}` : ''
    }
    case 'too_big': {
      const i = issue as { maximum?: number | bigint; type?: string }
      return i.maximum !== undefined ? `expected ${i.type ?? 'value'} <= ${i.maximum}` : ''
    }
    case 'invalid_value': {
      // Enum-style violations. We surface the *allowed* set (the schema's
      // own values, not the input's), never the rejected value.
      const i = issue as { values?: readonly unknown[] }
      return i.values ? `expected one of ${i.values.length} allowed values` : ''
    }
    default:
      return ''
  }
}
