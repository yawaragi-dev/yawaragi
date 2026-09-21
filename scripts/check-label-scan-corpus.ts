/**
 * `pnpm eval:corpus-check` — is the label-scan eval corpus ready to run?
 *
 * Phase 3 / S5 (#110). Building the 20-photo corpus is an inherently manual,
 * iterative job: photograph a bottle, drop the file in, hand-write its
 * ground-truth entry, repeat. This script is the fast feedback loop for that
 * loop — it answers "what is still missing?" without touching a provider.
 *
 * WHY this exists separately from `pnpm eval label-scan-jp`:
 *   The eval runner needs a provider. Even with the `e2e-stub` that means
 *   loading the `server-only` vision registry under `--conditions=react-server`,
 *   and with a real provider it means API calls that cost money. Neither is
 *   appropriate as the inner loop for "did I get the JSON right?". This script
 *   imports only the Zod schema and the filesystem, so it runs under plain
 *   Node, needs no credentials, and cannot spend anything.
 *
 * It is informational and NOT wired into `pnpm test` / `pnpm verify`, matching
 * the rest of the eval tooling. The one exception: a ground-truth file that
 * fails schema validation exits non-zero, because that is a real defect in a
 * committed file rather than a not-done-yet corpus.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { GroundTruthFileSchema } from '~/evals/label-scan-jp/schemas'

const EVAL_DIR = fileURLToPath(new URL('../evals/label-scan-jp', import.meta.url))
const PHOTOS_DIR = path.join(EVAL_DIR, 'photos')
const GROUND_TRUTH_PATH = path.join(EVAL_DIR, 'ground-truth.json')

/** Mirrors the runner's constants so the two can't drift apart silently. */
const TARGET_PHOTO_COUNT = 20
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

function readPhotoFiles(): string[] {
  if (!existsSync(PHOTOS_DIR)) return []
  return readdirSync(PHOTOS_DIR)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort()
}

function main(): void {
  const parsed = GroundTruthFileSchema.safeParse(
    JSON.parse(readFileSync(GROUND_TRUTH_PATH, 'utf8')),
  )

  if (!parsed.success) {
    console.error('✗ ground-truth.json does not match the schema:\n')
    console.error(parsed.error.message)
    // A committed file that fails validation is a defect, not an unfinished
    // corpus — this is the one case worth a non-zero exit.
    process.exit(1)
  }

  const groundTruth = parsed.data
  const photoFiles = readPhotoFiles()
  const photoSet = new Set(photoFiles)

  // The synthetic smoke fixture lives in fixtures/, never counts toward the
  // corpus target, and would otherwise show up as "entry with no photo".
  const realEntries = Object.entries(groundTruth).filter(
    ([, entry]) => entry.provenance.source !== 'synthetic_smoke_fixture',
  )

  const ready: string[] = []
  const missingPhoto: string[] = []
  const notCleared: string[] = []

  for (const [filename, entry] of realEntries) {
    if (!photoSet.has(filename)) {
      missingPhoto.push(filename)
    } else if (!entry.provenance.rightsCleared) {
      notCleared.push(filename)
    } else {
      ready.push(filename)
    }
  }

  const missingEntry = photoFiles.filter((f) => !(f in groundTruth))

  console.log(`\n# Label-scan eval corpus — ${ready.length}/${TARGET_PHOTO_COUNT} photos ready\n`)

  if (ready.length > 0) {
    console.log(`✓ Scoreable (${ready.length}):`)
    for (const f of ready) console.log(`    ${f}`)
    console.log()
  }

  if (missingEntry.length > 0) {
    console.log(`⚠ Photo on disk with NO ground-truth entry (${missingEntry.length}) —`)
    console.log(`  add a "<filename>" key to ground-truth.json for each:`)
    for (const f of missingEntry) console.log(`    ${f}`)
    console.log()
  }

  if (missingPhoto.length > 0) {
    console.log(`⚠ Ground-truth entry with NO photo on disk (${missingPhoto.length}) —`)
    console.log(`  placeholder, typo, or the photo still needs adding to photos/:`)
    for (const f of missingPhoto) console.log(`    ${f}`)
    console.log()
  }

  if (notCleared.length > 0) {
    console.log(`⚠ Photo present but rights NOT cleared (${notCleared.length}) —`)
    console.log(`  the runner SKIPS these; set provenance.rightsCleared: true once`)
    console.log(`  the rights genuinely exist:`)
    for (const f of notCleared) console.log(`    ${f}`)
    console.log()
  }

  const remaining = TARGET_PHOTO_COUNT - ready.length
  if (remaining > 0) {
    console.log(
      `→ ${remaining} more rights-cleared photo(s) needed before the DEGRADED CORPUS banner clears.`,
    )
    console.log(`  See evals/label-scan-jp/README.md → "MAINTAINER TODO".\n`)
  } else {
    console.log(`→ Corpus complete. Run: pnpm eval label-scan-jp\n`)
  }
}

main()
