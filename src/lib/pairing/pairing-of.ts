import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { ScanGrade, ScanStyle } from '@/lib/schemas/label-scan-extraction'
import { resolvePairing, stylesFromWords, type AxisStats, type Pairing } from './resolve-pairing'

/** What an own bottling says that a pairing can use. */
export type BottlingForPairing = Pick<Expression, 'brandId' | 'grade' | 'styles'>

/**
 * Whatever "Goes with" can be asked about (§9.7, §9a):
 * - `sake` — a catalogue sake: only its line's chart speaks;
 * - `bottling` — a bottling the visitor added themselves: its own grade and
 *   style words first, its line's chart after;
 * - `cellar` — a cellar row: the bottling it is of, when it is of one and
 *   that bottling is still there, plus the row's own "nama", which is the
 *   visitor's statement about that bottle. A row whose bottling has since
 *   been deleted is read as a bottle of its line.
 */
export type PairingSubject =
  | { kind: 'sake'; brandId: number }
  | { kind: 'bottling'; expression: BottlingForPairing }
  | {
      kind: 'cellar'
      bottle: Pick<CellarBottle, 'brandId' | 'nama' | 'expression'>
      /** The Expression the row names, looked up by the caller; `null` or absent when gone or none. */
      expression?: BottlingForPairing | null
    }

/** What the pairing reads, once the subject is taken apart. */
export interface PairingInputs {
  /** The line whose chart may speak, or `null` when the bottle has none. */
  brandId: number | null
  styles: ScanStyle[]
  grade?: ScanGrade
}

/**
 * The catalogue reads a pairing needs, injected so the join is testable with
 * fakes. Server code passes `cataloguePairingDeps` (`catalogue-pairing-deps.ts`).
 */
export interface PairingDeps {
  /** The line's flavor chart, or `null` when it has none (or cannot be read). */
  lookupChart: (brandId: number) => Promise<FlavorProfile | null>
  /** The catalogue's mean and spread per axis, or `null` when unavailable. */
  axisStats: () => Promise<AxisStats | null>
}

/** The subject taken apart into what `resolvePairing` reads, before any lookup. */
export function pairingInputs(subject: PairingSubject): PairingInputs {
  switch (subject.kind) {
    case 'sake':
      return { brandId: subject.brandId, styles: [] }
    case 'bottling':
      return fromBottling(subject.expression)
    case 'cellar': {
      const { bottle, expression } = subject
      const inputs = expression ? fromBottling(expression) : { brandId: bottle.brandId, styles: [] }
      if (bottle.nama && !inputs.styles.includes('nama')) inputs.styles = [...inputs.styles, 'nama']
      return inputs
    }
  }
}

function fromBottling(expression: BottlingForPairing): PairingInputs {
  return {
    brandId: expression.brandId,
    styles: stylesFromWords(expression.styles ?? []),
    ...(expression.grade ? { grade: expression.grade } : {}),
  }
}

/**
 * What a sake, bottling or cellar bottle goes with, or `null` to say nothing.
 * Reads the line's chart and the catalogue's figures only when there is a
 * line, then lets `resolvePairing` decide — so `basis` and `source` are its
 * own: `manual_curation` through a style or grade, `sakenowa_inferred`
 * through the chart.
 */
export async function pairingOf(subject: PairingSubject, deps: PairingDeps): Promise<Pairing | null> {
  const { brandId, styles, grade } = pairingInputs(subject)
  const [chart, stats] =
    brandId === null ? [null, null] : await Promise.all([deps.lookupChart(brandId), deps.axisStats()])
  return resolvePairing({ styles, grade, chart, stats })
}
