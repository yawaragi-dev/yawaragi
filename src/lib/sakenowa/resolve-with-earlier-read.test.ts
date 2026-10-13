import { describe, expect, it, vi } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { FindSakeByExtractionResult, SakeLookupQuery } from './lookup'
import {
  resolveScannedLabel,
  type ScannedLabel,
  type ScannedLabelLookupExecutor,
} from './resolve-scanned-label'
import { resolveWithEarlierRead } from './resolve-with-earlier-read'

// A second photo of a bottle, resolved with what an earlier photo read
// (#408). The catalogue is a fake keyed by the query, so each test states
// what the catalogue holds and which read asks for what.

const brand = (brandId: number, nameKanji: string, nameRomaji: string, breweryId: number): Brand => ({
  brandId,
  name: nameRomaji,
  nameKanji,
  nameRomaji,
  breweryId,
  source: 'sakenowa',
})
const brewery = (breweryId: number, nameKanji: string, nameRomaji: string): Brewery => ({
  breweryId,
  name: nameRomaji,
  nameKanji,
  nameRomaji,
  areaId: 1,
  source: 'sakenowa',
})

const NINKI_SHUZO = brewery(10, '人気酒造', 'Ninki Shuzo')
const NINKI_ICHI = brand(191, '人気一', 'Ninki Ichi', 10)
const URARAKA = brand(192, 'うららか', 'Uraraka', 10)
const SEKINOICHI_SHUZO = brewery(20, '世嬉の一酒造', 'Sekinoichi Shuzo')
const SEKINOICHI = brand(1134, '世嬉の一', 'Sekinoichi', 20)
const HANATOMOE = brand(793, '花巴', 'Hanatomoe', 30)
const MIYOSHINO = brewery(30, '美吉野醸造', 'Miyoshino Jozo')
const KUBOTA = brand(4, '久保田', 'Kubota', 40)

const NO_MATCH = (query: SakeLookupQuery): FindSakeByExtractionResult => ({ kind: 'no_match', query })
const listOf = (query: SakeLookupQuery, maker: Brewery, ...sakes: Brand[]): FindSakeByExtractionResult => ({
  kind: 'ambiguous',
  candidates: sakes.map((sake) => ({ sake, brewery: maker })),
  query,
})

/** A catalogue that answers each (name, brewery) query from a table; anything else is not found. */
function catalogue(answers: Record<string, (query: SakeLookupQuery) => FindSakeByExtractionResult>) {
  const answer = (query: SakeLookupQuery) => (answers[`${query.nameJa} / ${query.breweryJa}`] ?? NO_MATCH)(query)
  const find = vi.fn(async (query: SakeLookupQuery) => answer(query))
  const executor = {
    findByExtraction: find,
    findByLatinBrewery: find,
    findByBreweryOnly: vi.fn(async (query: SakeLookupQuery) => NO_MATCH(query)),
    findByBrandOnly: vi.fn(async (query: SakeLookupQuery) => NO_MATCH(query)),
    listSiblings: vi.fn(async () => []),
  } as unknown as ScannedLabelLookupExecutor
  return { executor, find }
}

const read = (name_ja: string, brewery_ja: string, rest: Partial<ScannedLabel> = {}): ScannedLabel => ({
  name_ja,
  brewery_ja,
  confidence: 0.9,
  ...rest,
})

async function secondScan(second: ScannedLabel, first: ScannedLabel, executor: ScannedLabelLookupExecutor) {
  const own = await resolveScannedLabel(second, executor)
  return { own, guess: await resolveWithEarlierRead(second, own, first, executor) }
}

describe('a second photo, with what the first one read', () => {
  it('answers from the second photo alone whenever that gives one sake', async () => {
    const { executor, find } = catalogue({
      '久保田 / 朝日酒造': () => ({ kind: 'exact', sake: KUBOTA }),
      '花巴 / 美吉野醸造': () => ({ kind: 'exact', sake: HANATOMOE }),
    })
    const { own, guess } = await secondScan(read('久保田', '朝日酒造'), read('花巴', '美吉野醸造'), executor)

    expect(own).toMatchObject({ kind: 'exact', sake: KUBOTA })
    expect(guess).toBeNull()
    // The earlier read is not even looked up.
    expect(find).not.toHaveBeenCalledWith(expect.objectContaining({ nameJa: '花巴' }))
  })

  it('picks the line the front label named when the back label prints only the house mark', async () => {
    const { executor } = catalogue({
      'NINKI / Ninki': (q) => listOf(q, NINKI_SHUZO, NINKI_ICHI, URARAKA),
      '人気一 / 人気酒造': () => ({ kind: 'exact', sake: NINKI_ICHI }),
    })
    const { own, guess } = await secondScan(read('NINKI', 'Ninki'), read('人気一', '人気酒造'), executor)

    expect(own.kind).toBe('ambiguous')
    expect(guess?.sake).toEqual(NINKI_ICHI)
  })

  it('offers nothing when the two photos share no brand and no brewery', async () => {
    const { executor } = catalogue({
      'NINKI / Ninki': (q) => listOf(q, NINKI_SHUZO, NINKI_ICHI, URARAKA),
      '花巴 / 美吉野醸造': () => ({ kind: 'exact', sake: HANATOMOE }),
    })
    const { guess } = await secondScan(read('NINKI', 'Ninki'), read('花巴', '美吉野醸造'), executor)

    expect(guess).toBeNull()
  })

  it('does not put the last bottle on a label that names a sake of its own', async () => {
    // The brewery on the second label was misread as the first bottle's.
    // The label names 吉野杉の, which is none of that brewery's lines and not
    // its house name: it is another sake, and stays one.
    const { executor } = catalogue({
      '吉野杉の / 美吉野醸造': (q) => listOf(q, MIYOSHINO, HANATOMOE, brand(794, '樽丸', 'Tarumaru', 30)),
      '花巴 / 美吉野醸造': () => ({ kind: 'exact', sake: HANATOMOE }),
    })
    const { guess } = await secondScan(read('吉野杉の', '美吉野醸造'), read('花巴', '美吉野醸造'), executor)

    expect(guess).toBeNull()
  })

  it('keeps a low-scored read when the earlier photo found the same sake by itself', async () => {
    const brandOnly = (query: SakeLookupQuery): FindSakeByExtractionResult => ({
      kind: 'matched_brand_only',
      sake: SEKINOICHI,
      brewery: SEKINOICHI_SHUZO,
      breweryDivergence: { extracted: '関酒造', stored: '世嬉の一酒造' },
      query,
    })
    const { executor } = catalogue({
      'SEKINO-ICHI / 関酒造': brandOnly,
      '世嬉の一 / 世嬉の一酒造': () => ({ kind: 'exact', sake: SEKINOICHI }),
    })
    const { own, guess } = await secondScan(
      read('SEKINO-ICHI', '関酒造', { confidence: 0.4 }),
      read('世嬉の一', '世嬉の一酒造'),
      executor,
    )

    expect(own.kind).toBe('low_confidence')
    expect(guess?.sake).toEqual(SEKINOICHI)
  })

  it('turns the same low-scored read away when the earlier photo was another sake', async () => {
    const { executor } = catalogue({
      'SEKINO-ICHI / 関酒造': (query) => ({
        kind: 'matched_brand_only',
        sake: SEKINOICHI,
        brewery: SEKINOICHI_SHUZO,
        breweryDivergence: { extracted: '関酒造', stored: '世嬉の一酒造' },
        query,
      }),
      '花巴 / 美吉野醸造': () => ({ kind: 'exact', sake: HANATOMOE }),
    })
    const { guess } = await secondScan(
      read('SEKINO-ICHI', '関酒造', { confidence: 0.4 }),
      read('花巴', '美吉野醸造'),
      executor,
    )

    expect(guess).toBeNull()
  })

  it('finds a front label with no brewery on it under the brewery the back label named', async () => {
    const { executor } = catalogue({
      // The catalogue has the sake under its maker, in either script.
      '世嬉の一 / Sekinoichi Shuzo': () => ({ kind: 'exact', sake: SEKINOICHI }),
      'SEKINOICHI / Sekinoichi Shuzo': () => ({ kind: 'exact', sake: SEKINOICHI }),
    })
    const { own, guess } = await secondScan(
      read('世嬉の一', '不明の酒造'),
      read('SEKINOICHI', 'Sekinoichi Shuzo', { other_names: ['世嬉の一'] }),
      executor,
    )

    expect(own.kind).toBe('no_match')
    expect(guess?.sake).toEqual(SEKINOICHI)
  })

  it("never looks the earlier photo's name up as this photo's name", async () => {
    // Same brewery, another bottle: the second label's own name finds
    // nothing, and the first bottle's name must not be tried in its place.
    const { executor, find } = catalogue({
      '人気一 / 人気酒造': () => ({ kind: 'exact', sake: NINKI_ICHI }),
    })
    const { own, guess } = await secondScan(read('黒人気', '人気酒造'), read('人気一', '人気酒造'), executor)

    expect(own.kind).toBe('no_match')
    expect(guess).toBeNull()
    const askedForFirstName = find.mock.calls.filter(([query]) => query.nameJa === '人気一')
    // Once: resolving the earlier read itself.
    expect(askedForFirstName).toHaveLength(1)
  })
})
