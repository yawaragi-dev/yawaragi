/**
 * `pnpm eval label-scan-pairs` — what a second photo adds (#408).
 *
 * No model is called: this replays the saved reads of the shipped tier pair
 * (`evals/label-scan-jp/recordings/reads.json`) through the real lookup, for
 * every ordered pair of photos — "first scan A, second scan B".
 *
 * Two questions, one per kind of pair:
 *
 * - **Different bottles.** The second photo is another bottle, whatever the
 *   visitor meant. Its own answer is never changed (the scan action does not
 *   even ask when it has one), so what is counted here is how often the
 *   earlier read still put a guess beside it. Across different breweries
 *   that must be never. Two bottles of one brewery share a field, so a guess
 *   can appear; each one is listed.
 * - **The same bottle.** How many second scans that had no single answer of
 *   their own get the right sake from the two reads together.
 *
 * Needs `DATABASE_URL` (the catalogue). Free to run.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_VISION_PROVIDER_KEY, TIER_2_VISION_PROVIDER_KEY } from '@/lib/ai/vision/registry'
import {
  resolveScannedLabel,
  type ResolveScannedLabelResult,
  type ScannedLabel,
} from '@/lib/sakenowa/resolve-scanned-label'
import { resolveWithEarlierRead } from '@/lib/sakenowa/resolve-with-earlier-read'
import { GroundTruthFileSchema, SavedReadsFileSchema } from '~/evals/label-scan-jp/schemas'

const EVAL_DIR = fileURLToPath(new URL('../evals/label-scan-jp', import.meta.url))

interface Photo {
  file: string
  bottle: string
  brewery: string
  expected: readonly number[]
  read: ScannedLabel
  own: ResolveScannedLabelResult
}

const hasOneSake = (r: ResolveScannedLabelResult): r is Extract<ResolveScannedLabelResult, { sake: unknown }> =>
  r.kind === 'exact' || r.kind === 'matched_brand_only' || r.kind === 'matched_brewery_only'

async function main() {
  const groundTruth = GroundTruthFileSchema.parse(
    JSON.parse(readFileSync(path.join(EVAL_DIR, 'ground-truth.json'), 'utf8')),
  )
  const saved = SavedReadsFileSchema.parse(
    JSON.parse(readFileSync(path.join(EVAL_DIR, 'recordings', 'reads.json'), 'utf8')),
  )
  const tier1 = saved.providers[DEFAULT_VISION_PROVIDER_KEY]?.reads ?? {}
  const tier2 = saved.providers[TIER_2_VISION_PROVIDER_KEY]?.reads ?? {}

  const photos: Photo[] = []
  for (const [file, entry] of Object.entries(groundTruth)) {
    if (!entry.bottle || !entry.expectedBrandIds || !entry.provenance.rightsCleared) continue
    // The read the scan action ends with: tier 1 if it is an exact match,
    // otherwise tier 2.
    let chosen: { read: ScannedLabel; own: ResolveScannedLabelResult } | undefined
    for (const candidate of [tier1[file], tier2[file]]) {
      if (!candidate || 'error' in candidate) continue
      const read: ScannedLabel = {
        name_ja: candidate.name_ja,
        brewery_ja: candidate.brewery_ja,
        other_names: candidate.other_names,
        confidence: candidate.confidence,
      }
      const own = await resolveScannedLabel(read)
      chosen = { read, own }
      if (own.kind === 'exact') break
    }
    if (!chosen) continue
    photos.push({ file, bottle: entry.bottle, brewery: entry.brewery_ja, expected: entry.expectedBrandIds, ...chosen })
  }

  const needy = photos.filter((p) => !hasOneSake(p.own))
  console.log(`# label-scan-pairs — ${new Date().toISOString()}`)
  console.log(``)
  console.log(`${photos.length} photos, ${new Set(photos.map((p) => p.bottle)).size} bottles.`)
  console.log(
    `${photos.length - needy.length} photos give one sake on their own; an earlier read is never consulted for those.`,
  )
  console.log(`${needy.length} do not: ${needy.map((p) => `${p.file} (${p.own.kind})`).join(', ')}`)
  console.log(``)

  const same = { pairs: 0, right: 0, wrong: 0, none: 0 }
  const other = { pairs: 0, guessSameBrewery: 0, guessOtherBrewery: 0 }
  const lines: string[] = []

  for (const second of needy) {
    for (const first of photos) {
      if (first.file === second.file) continue
      const guess = await resolveWithEarlierRead(second.read, second.own, first.read)
      const landed = guess ? `${guess.sake.brandId}:${guess.sake.nameKanji}` : '—'

      if (first.bottle === second.bottle) {
        same.pairs++
        const notInCatalogue = second.expected.length === 0
        const verdict = guess
          ? second.expected.includes(guess.sake.brandId)
            ? 'right'
            : 'wrong'
          : notInCatalogue
            ? 'right'
            : 'none'
        same[verdict]++
        lines.push(`| same bottle | ${first.file} | ${second.file} | ${landed} | ${verdict} |`)
      } else {
        other.pairs++
        if (!guess) continue
        const sameBrewery = first.brewery === second.brewery
        if (sameBrewery) other.guessSameBrewery++
        else other.guessOtherBrewery++
        lines.push(
          `| other bottle, ${sameBrewery ? 'same' : 'OTHER'} brewery | ${first.file} | ${second.file} | ${landed} | guess shown |`,
        )
      }
    }
  }

  const untouched = (photos.length - needy.length) * (photos.length - 1)
  console.log(`## The same bottle (second scan had no single answer of its own)`)
  console.log(``)
  console.log(`| pairs | right with both reads | wrong | still nothing |`)
  console.log(`|---|---|---|---|`)
  console.log(`| ${same.pairs} | ${same.right} | ${same.wrong} | ${same.none} |`)
  console.log(``)
  console.log(`## Different bottles`)
  console.log(``)
  console.log(`| pairs | answer unchanged, by rule | a guess shown, same brewery | a guess shown, other brewery |`)
  console.log(`|---|---|---|---|`)
  console.log(`| ${other.pairs + untouched} | ${untouched} | ${other.guessSameBrewery} | ${other.guessOtherBrewery} |`)
  console.log(``)
  console.log(`## Detail`)
  console.log(``)
  console.log(`| pair | first scan | second scan | both reads together | |`)
  console.log(`|---|---|---|---|---|`)
  for (const line of lines) console.log(line)

  // A guess carried across breweries is the failure #408 forbids.
  process.exit(other.guessOtherBrewery > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('eval-label-scan-pairs: fatal error', err)
  process.exit(1)
})
