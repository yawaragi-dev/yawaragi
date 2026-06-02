import { describe, expect, it } from 'vitest'
import { IngestionRunSchema, parseIngestionRun } from './ingestion-run'

const validRun = {
  source: 'manual_curation',
  runId: '11111111-1111-4111-8111-111111111111',
  startedAt: '2026-05-29T10:00:00.000Z',
  finishedAt: '2026-05-29T10:00:45.000Z',
  status: 'success',
  perTable: {
    brands: { added: 12, updated: 3, unchanged: 3000, total: 3015 },
    rankings: { total: 100 },
  },
  sourceRevisionHash: 'a'.repeat(64),
  errorMessage: null,
} as const

describe('IngestionRun schema', () => {
  it('parses a valid success row', () => {
    expect(parseIngestionRun(validRun)).toEqual(validRun)
  })

  it('parses a failed row with an errorMessage', () => {
    const failed = { ...validRun, status: 'failed', errorMessage: 'Sakenowa returned 500' }
    expect(parseIngestionRun(failed)).toMatchObject({ status: 'failed', errorMessage: 'Sakenowa returned 500' })
  })

  it('rejects an unknown status', () => {
    expect(() => parseIngestionRun({ ...validRun, status: 'pending' })).toThrow()
  })

  it('rejects a non-UUID runId', () => {
    expect(() => parseIngestionRun({ ...validRun, runId: 'not-a-uuid' })).toThrow()
  })

  it('rejects a non-RFC-3339 timestamp', () => {
    expect(() => parseIngestionRun({ ...validRun, startedAt: 'yesterday' })).toThrow()
  })

  it('rejects negative counts in perTable', () => {
    expect(() =>
      parseIngestionRun({
        ...validRun,
        perTable: { brands: { added: -1, total: 1 } },
      }),
    ).toThrow()
  })

  it('rejects an empty sourceRevisionHash', () => {
    expect(() => parseIngestionRun({ ...validRun, sourceRevisionHash: '' })).toThrow()
  })

  it('accepts an empty perTable (a run that fetched nothing)', () => {
    expect(() => parseIngestionRun({ ...validRun, perTable: {} })).not.toThrow()
  })

  it('rejects a run without a source (provenance still required for telemetry)', () => {
    const { source: _omit, ...withoutSource } = validRun
    void _omit
    expect(() => parseIngestionRun(withoutSource)).toThrow()
  })

  it('rejects any source other than the manual_curation literal', () => {
    // Telemetry rows are hand-stamped by the ingestion script — none of
    // the other 6 provenance kinds can produce an IngestionRun. Pinning
    // the literal here mirrors the DB DEFAULT in 0008_ingestion_runs.sql.
    expect(() => parseIngestionRun({ ...validRun, source: 'sakenowa' })).toThrow()
    expect(() => parseIngestionRun({ ...validRun, source: 'sakenowa_inferred' })).toThrow()
    expect(() => parseIngestionRun({ ...validRun, source: 'llm_extracted' })).toThrow()
    expect(() => parseIngestionRun({ ...validRun, source: 'llm_inferred' })).toThrow()
    expect(() => parseIngestionRun({ ...validRun, source: 'cross_beverage_map' })).toThrow()
    expect(() => parseIngestionRun({ ...validRun, source: 'user_corrected' })).toThrow()
  })

  it('exposes IngestionRunSchema for composition', () => {
    expect(IngestionRunSchema.parse(validRun)).toEqual(validRun)
  })

  it('accepts yearMonth on perTable.rankings (Sakenowa snapshot month for #54)', () => {
    // CONTEXT.md "Ranking" defines year_month as part of the concept;
    // #54's cron route reads this to compare "fresh snapshot vs. same
    // as last run" before deciding to re-ingest.
    const withYearMonth = parseIngestionRun({
      ...validRun,
      perTable: { rankings: { total: 100, yearMonth: '202402' } },
    })
    expect(withYearMonth.perTable.rankings).toMatchObject({ yearMonth: '202402' })
  })

  it('rejects an empty-string yearMonth', () => {
    expect(() =>
      parseIngestionRun({
        ...validRun,
        perTable: { rankings: { total: 100, yearMonth: '' } },
      }),
    ).toThrow()
  })
})
