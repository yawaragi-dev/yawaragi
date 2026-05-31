import { describe, expect, it } from 'vitest'
import {
  README_BEGIN_MARKER,
  README_END_MARKER,
  percentString,
  progressBar,
  renderDetailDoc,
  renderReadmeBlock,
  spliceReadmeBlock,
} from './render'
import type { DashboardSnapshot } from './types'

const SNAPSHOT: DashboardSnapshot = {
  generatedAt: '2026-05-31T12:00:00.000Z',
  milestones: [
    {
      id: 'M1',
      label: 'Compliance & i18n foundation',
      phaseLabel: 'Phase 0',
      description: 'Age gate, cookie banner, i18n.',
      closedCount: 5,
      openCount: 1,
      closedWeight: 2000,
      openWeight: 200,
      scoped: true,
    },
    {
      id: 'M2',
      label: 'Data foundation',
      phaseLabel: 'Phase 2',
      description: 'Sakenowa mirror.',
      closedCount: 4,
      openCount: 6,
      closedWeight: 6000,
      openWeight: 4000,
      scoped: true,
    },
    {
      id: 'M3',
      label: 'Flagship surfaces',
      phaseLabel: 'Phases 3–5',
      description: 'Label scan, chat, taste profile.',
      closedCount: 0,
      openCount: 0,
      closedWeight: 0,
      openWeight: 0,
      scoped: false,
    },
  ],
  etas: [
    {
      id: 'M1',
      remainingWeight: 200,
      eta: { optimistic: '2026-06-02', median: '2026-06-04', pessimistic: '2026-06-08' },
      rationale: 'Based on 5 PR(s).',
    },
    {
      id: 'M2',
      remainingWeight: 4000,
      eta: { optimistic: '2026-06-20', median: '2026-07-10', pessimistic: '2026-08-20' },
      rationale: 'Based on 5 PR(s).',
    },
    { id: 'M3', remainingWeight: 0, eta: null, rationale: 'Not yet scoped.' },
  ],
  velocity: { locPerDay: 100, windowDays: 14, prCount: 5, totalLoc: 1400 },
  notMeasured: ['Time-in-review per PR.'],
}

describe('progressBar', () => {
  it('renders all empty when total is zero (no false positive of "done")', () => {
    expect(progressBar(0, 0, 10)).toBe('░░░░░░░░░░')
  })

  it('renders all filled when closed equals total', () => {
    expect(progressBar(5, 5, 5)).toBe('█████')
  })

  it('clamps overshoots so a stale snapshot can not draw past 100%', () => {
    expect(progressBar(10, 5, 5)).toBe('█████')
  })
})

describe('percentString', () => {
  it('returns "n/a" rather than NaN when total is zero', () => {
    expect(percentString(0, 0)).toBe('n/a')
  })

  it('rounds to a whole percent', () => {
    expect(percentString(1, 3)).toBe('33%')
  })
})

describe('renderReadmeBlock', () => {
  it('wraps the output in the splice markers so it can be re-injected idempotently', () => {
    const out = renderReadmeBlock(SNAPSHOT)
    expect(out).toContain(README_BEGIN_MARKER)
    expect(out).toContain(README_END_MARKER)
  })

  it('shows the median ETA per scoped milestone and "not scoped" for unscoped', () => {
    const out = renderReadmeBlock(SNAPSHOT)
    expect(out).toContain('2026-07-10') // M2 median
    expect(out).toContain('not scoped') // M3
  })

  it('includes a "regenerate with" line so a stale dashboard can be recovered without code spelunking', () => {
    const out = renderReadmeBlock(SNAPSHOT)
    expect(out).toContain('pnpm progress')
  })
})

describe('renderDetailDoc', () => {
  it('lists every milestone with its description', () => {
    const out = renderDetailDoc(SNAPSHOT)
    expect(out).toContain('Sakenowa mirror.')
    expect(out).toContain('Phase 0')
    expect(out).toContain('Phases 3–5')
  })

  it('renders the "What is NOT measured" section verbatim from the snapshot', () => {
    const out = renderDetailDoc(SNAPSHOT)
    expect(out).toContain('Time-in-review per PR.')
  })

  it('exposes the velocity numbers so a reader can audit the ETA', () => {
    const out = renderDetailDoc(SNAPSHOT)
    expect(out).toContain('1400') // totalLoc
    expect(out).toContain('100.0') // locPerDay
  })
})

describe('spliceReadmeBlock', () => {
  it('replaces the contents between the markers without touching the rest of the file', () => {
    const before = `# Project\n\nIntro\n\n${README_BEGIN_MARKER}\nold body\n${README_END_MARKER}\n\nTail`
    const block = `${README_BEGIN_MARKER}\nnew body\n${README_END_MARKER}`
    const out = spliceReadmeBlock(before, block)
    expect(out).toContain('Intro')
    expect(out).toContain('Tail')
    expect(out).toContain('new body')
    expect(out).not.toContain('old body')
  })

  it('throws a clear error when the markers are missing rather than silently doing nothing', () => {
    expect(() => spliceReadmeBlock('# Project (no markers)', 'whatever')).toThrow(
      /progress:start.*progress:end/,
    )
  })
})
