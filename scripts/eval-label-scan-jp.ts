/**
 * Phase 3 / S5 (#110) — `pnpm eval label-scan-jp` runner.
 *
 * Scores candidate `VisionProvider` implementations against a small labeled
 * set of JP sake-label photos. Its output is the provider × metrics
 * comparison table that drives the "Finetune & failover" follow-up (fallback
 * vendor choice, switch policy, schema-richness re-eval).
 *
 * # How it differs from the suggest-jp runner
 *
 * `eval-suggest-jp.ts` drives the suggest surface over HTTP because that
 * surface is a whole server action (rate limit + cookies + MCP tool loop).
 * Label-scan is a single-method seam — `VisionProvider.extractLabel(blob)` —
 * so this runner calls it DIRECTLY. That means importing the `server-only`
 * registry from a Node script, which is why the `pnpm eval` npm script runs
 * tsx with `--conditions=react-server` (see `scripts/eval.ts` header): the
 * condition resolves `server-only` to its empty shim, exactly as the Next.js
 * RSC bundler does in production.
 *
 * # Providers under test
 *
 * Resolved (first match wins):
 *   1. `LABEL_SCAN_EVAL_PROVIDERS` env — comma-separated registry keys
 *      (e.g. `anthropic-haiku-4-5,anthropic-sonnet-4-6`).
 *   2. `evals/label-scan-jp/providers.json` — a JSON array of registry keys.
 *   3. Default — `[DEFAULT_VISION_PROVIDER_KEY]` (anthropic-haiku-4-5).
 * Every key is validated against the registry's `VISION_PROVIDER_KEYS`; an
 * unknown key aborts before any paid call.
 *
 * # Metric (per provider, per field)
 *
 *   charAccuracy = 1 - levenshtein(expected, actual) / max(len)   (codepoints)
 *   exactMatch   = (name_ja exact) AND (brewery_ja exact)
 * Reported: mean name_ja accuracy, mean brewery_ja accuracy, exact-match
 * rate, and median latency — one row per provider. Where an entry lists
 * `also` readings, a field is scored against the best of them.
 *
 * # Resolution — did the scan land on the right sake
 *
 * Reading the label is half a scan. With `DATABASE_URL` set, each extraction
 * also goes through `resolveScannedLabel` — the guards and the lookup cascade
 * the scan action runs — and the row it lands on is compared with the entry's
 * `expectedBrandIds`:
 *
 *   right     one sake, and it is the bottle
 *   in list   several candidates, the bottle among them
 *   wrong     a sake that is not the bottle (or any sake, for a bottle the
 *             catalogue does not have)
 *   none      no answer for a bottle the catalogue has
 *   in photo  only for the other kinds of photo, below
 *
 * A bottle the catalogue lacks is `right` when the scan says so. `right
 * ungated` is the same count with the model's self-reported confidence read
 * as 1 — the gap between the two is what the confidence gate costs. When both
 * tiers of a pair are in the run, a `two-tier (…)` row replays the scan
 * action's rule — keep tier 1 only on a first-pass exact match, else take
 * tier 2 — from the calls already made, so it costs nothing extra.
 *
 * # Photos that are not one sake bottle
 *
 * A ground-truth entry may say the photo shows a bottle that is not sake, a
 * menu, or several bottles (`subject` / `drink` / `items`). Those have their
 * own right answers (`evals/label-scan-jp/judge.ts`) and are reported in a
 * table of their own; the comparison table and "Where the scan landed" count
 * photos of one sake bottle only, so their numbers stay comparable from run
 * to run as such photos are added.
 *
 * # Saved reads
 *
 * Every model read is saved to `recordings/reads.json`, keyed by provider,
 * prompt and photo, and reused by the next run: a model is only called for
 * a photo it has not read with the current prompt. So a run after a lookup
 * change costs nothing, a run after adding three photos costs three calls
 * per provider, and a run after a prompt edit re-reads everything — which
 * is what should cost money.
 *
 *   LABEL_SCAN_EVAL_OFFLINE=1  never call a model; a photo with no saved
 *                              read counts as an error.
 *   LABEL_SCAN_EVAL_FRESH=1    ignore saved reads and ask again (models are
 *                              not deterministic; this is how to see by
 *                              how much).
 *
 * Saved reads make two runs comparable: a lookup change shows as exactly
 * its own effect, not as model noise.
 *
 * # Rate-limit posture
 *
 * Strictly serial: one provider at a time, one photo at a time, `await`ed.
 * Between real-provider calls the runner sleeps `LABEL_SCAN_EVAL_THROTTLE_MS`
 * (default 1000ms) so a 20-photo run doesn't burst the Anthropic API. The
 * `e2e-stub` provider does no network I/O, so the throttle is skipped for it.
 * No `Promise.all`, no parallel workers — CLAUDE.md "no parallel hammering".
 *
 * # Not a test
 *
 * Informational only. No pass/fail, no CI wiring. The metric MATH is unit-
 * tested in `evals/label-scan-jp/levenshtein.test.ts` (that runs in
 * `pnpm test`); this runner does not.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  DEFAULT_VISION_PROVIDER_KEY,
  TIER_2_VISION_PROVIDER_KEY,
  VISION_PROVIDER_KEYS,
  getVisionProvider,
  type VisionProviderKey,
} from '@/lib/ai/vision/registry'
import {
  resolveScannedLabel,
  type ResolveScannedLabelResult,
} from '@/lib/sakenowa/resolve-scanned-label'
import { LABEL_SCAN_PROMPTS } from '@/lib/ai/vision/anthropic-haiku-provider'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import { notOneBottleOfSake, type NotOneBottleOfSake } from '@/lib/scan/read-kind'
import { canJudge, judgeLanding, type Landing, type Verdict } from '~/evals/label-scan-jp/judge'
import { charAccuracy } from '~/evals/label-scan-jp/levenshtein'
import { photosInTheWrongFolder } from '~/evals/label-scan-jp/photo-folders'
import {
  GroundTruthFileSchema,
  SavedReadsFileSchema,
  photoKind,
  type GroundTruthEntry,
  type PhotoKind,
  type PhotoView,
  type SavedRead,
  type SavedReadsFile,
} from '~/evals/label-scan-jp/schemas'

const EVAL_DIR = fileURLToPath(new URL('../evals/label-scan-jp', import.meta.url))
const PHOTOS_DIR = path.join(EVAL_DIR, 'photos')
/** Photos that are run but not published; git ignores the folder. */
const LOCAL_PHOTOS_DIR = path.join(PHOTOS_DIR, 'local')
const FIXTURES_DIR = path.join(EVAL_DIR, 'fixtures')
const GROUND_TRUTH_PATH = path.join(EVAL_DIR, 'ground-truth.json')
const PROVIDERS_CONFIG_PATH = path.join(EVAL_DIR, 'providers.json')
const SMOKE_FIXTURE = 'synthetic-smoke-label.jpg'

/** The AC's corpus target. Below this the run is DEGRADED (still runs). */
const TARGET_PHOTO_COUNT = 20
const THROTTLE_MS = Number(process.env.LABEL_SCAN_EVAL_THROTTLE_MS ?? '1000')
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

interface Resolution {
  /** `resolveScannedLabel`'s kind, or `error` when the lookup threw. */
  kind: ResolveScannedLabelResult['kind'] | NotOneBottleOfSake['kind'] | 'error'
  /** What the scan landed on, for the detail table. */
  landedOn: string
  verdict: Verdict
  /**
   * The verdict with the confidence gate taken out (confidence read as 1).
   * A read that is right but self-reported below the gate never reaches the
   * lookup; this says what the lookup would have done with it.
   */
  ungatedVerdict: Verdict
}

/**
 * Tier pairs to replay the scan action's retry rule over: the pair it runs
 * today, and the pair it ran until 2026-10-12.
 */
const TIER_PAIRS: readonly { label: string; tier1: VisionProviderKey; tier2: VisionProviderKey }[] = [
  { label: 'two-tier (as shipped)', tier1: DEFAULT_VISION_PROVIDER_KEY, tier2: TIER_2_VISION_PROVIDER_KEY },
  { label: 'two-tier (tier 1 at low effort)', tier1: 'anthropic-haiku-5-5-low', tier2: TIER_2_VISION_PROVIDER_KEY },
  { label: 'two-tier (Haiku 4.5 → Sonnet 4.6)', tier1: 'anthropic-haiku-4-5', tier2: 'anthropic-sonnet-4-6' },
]

interface PhotoResult {
  file: string
  view?: PhotoView
  /** Absent when the entry has no `expectedBrandIds` or there is no database. */
  resolution?: Resolution
  nameAccuracy: number
  breweryAccuracy: number
  exactMatch: boolean
  latencyMs: number
  status: 'ok' | 'error'
  detail?: string
  extractedNameJa?: string
  extractedBreweryJa?: string
  /** The other names the model read off the label. */
  otherNames?: string[]
  breweryPrinted?: boolean
  /** The model's self-reported confidence, 0..1. */
  confidence?: number
}

interface ProviderResult {
  /** A registry key, or the label of the replayed two-tier row. */
  key: string
  photos: PhotoResult[]
  constructionError?: string
}

/**
 * US dollars per million tokens, input / output: list prices on 2026-10-12.
 * A provider missing here is reported in tokens only.
 */
const PRICES: Partial<Record<VisionProviderKey, readonly [number, number]>> = {
  'anthropic-haiku-4-5': [1, 5],
  'anthropic-sonnet-4-6': [3, 15],
  'anthropic-haiku-5-5': [0.1, 0.5],
  'anthropic-sonnet-5-5': [2, 10],
  'anthropic-haiku-5-5-low': [0.1, 0.5],
  'anthropic-sonnet-5-5-low': [2, 10],
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

function isVisionProviderKey(value: string): value is VisionProviderKey {
  return (VISION_PROVIDER_KEYS as readonly string[]).includes(value)
}

const SAVED_READS_PATH = path.join(EVAL_DIR, 'recordings', 'reads.json')
const OFFLINE = process.env.LABEL_SCAN_EVAL_OFFLINE === '1'
const FRESH = process.env.LABEL_SCAN_EVAL_FRESH === '1'

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16)

/**
 * What a saved read was made with, besides the photo: the provider key (which
 * names the model) and the prompt. A read is reused only while both hold.
 */
function providerFingerprint(key: string): string {
  return key === 'e2e-stub' ? 'stub' : sha(`${LABEL_SCAN_PROMPTS.system}\n${LABEL_SCAN_PROMPTS.user}`)
}

function loadSavedReads(): SavedReadsFile {
  if (!existsSync(SAVED_READS_PATH)) return { providers: {} }
  return SavedReadsFileSchema.parse(JSON.parse(readFileSync(SAVED_READS_PATH, 'utf8')))
}

/** Resolve the provider list from env → config file → default. */
function resolveProviderList(): VisionProviderKey[] {
  let raw: string[] | undefined

  const envValue = process.env.LABEL_SCAN_EVAL_PROVIDERS
  if (envValue && envValue.trim() !== '') {
    raw = envValue.split(',').map((s) => s.trim()).filter(Boolean)
  } else if (existsSync(PROVIDERS_CONFIG_PATH)) {
    const parsed: unknown = JSON.parse(readFileSync(PROVIDERS_CONFIG_PATH, 'utf8'))
    if (!Array.isArray(parsed) || !parsed.every((k) => typeof k === 'string')) {
      throw new Error(
        `providers.json must be a JSON array of registry-key strings. Got: ${JSON.stringify(parsed)}`,
      )
    }
    raw = parsed
  }

  if (!raw || raw.length === 0) return [DEFAULT_VISION_PROVIDER_KEY]

  const invalid = raw.filter((k) => !isVisionProviderKey(k))
  if (invalid.length > 0) {
    throw new Error(
      `Unknown vision provider key(s): ${invalid.join(', ')}. Known keys: ${VISION_PROVIDER_KEYS.join(', ')}.`,
    )
  }
  // De-dup while preserving order.
  return [...new Set(raw as VisionProviderKey[])]
}

/** List image files in a directory, sorted, absolute paths. */
function listImages(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort()
}

interface CorpusEntry {
  file: string
  absPath: string
  groundTruth: GroundTruthEntry
}

/** The best score for one field over the expected reading and its `also` list. */
function fieldAccuracy(expected: string, also: readonly string[] | undefined, actual: string): number {
  return Math.max(...[expected, ...(also ?? [])].map((reading) => charAccuracy(reading, actual)))
}

/** Runs the scan action's matching on an extraction and judges where it landed. */
async function resolveAndJudge(
  extraction: LabelScanExtraction,
  entry: GroundTruthEntry,
): Promise<Resolution> {
  const gated = await judge(extraction, entry)
  const ungated = await judge({ ...extraction, confidence: 1 }, entry)
  return { ...gated, ungatedVerdict: ungated.verdict }
}

async function judge(
  extraction: LabelScanExtraction,
  entry: GroundTruthEntry,
): Promise<Omit<Resolution, 'ungatedVerdict'>> {
  // As the scan action does: a menu, several bottles or a bottle the label
  // says is not sake is answered without asking the catalogue.
  const other = notOneBottleOfSake(extraction)
  if (other) {
    const what = other.kind === 'not_sake' ? other.drink : other.subject
    return { kind: other.kind, landedOn: `— (${what})`, verdict: judgeLanding(entry, { kind: 'none' }) }
  }

  let resolved: ResolveScannedLabelResult
  try {
    resolved = await resolveScannedLabel(extraction)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { kind: 'error', landedOn: `lookup threw: ${message}`, verdict: 'none' }
  }

  let landing: Landing
  let landedOn: string
  if (resolved.kind === 'no_match' || resolved.kind === 'low_confidence') {
    landing = { kind: 'none' }
    landedOn = '—'
  } else if (resolved.kind === 'ambiguous') {
    landing = { kind: 'list', brandIds: resolved.candidates.map((c) => c.sake.brandId) }
    landedOn = resolved.candidates.map((c) => `${c.sake.brandId}:${c.sake.nameKanji}`).join(', ')
  } else {
    landing = { kind: 'one', brandId: resolved.sake.brandId }
    landedOn = `${resolved.sake.brandId}:${resolved.sake.nameKanji}`
  }
  return { kind: resolved.kind, landedOn, verdict: judgeLanding(entry, landing) }
}

/**
 * Replays the scan action's two-tier rule from the per-tier results: tier 1
 * stands only on a first-pass exact match whose brewery it did not say is
 * missing from the photo, anything else is tier 2's answer (and pays for
 * both calls).
 */
function replayTwoTier(label: string, tier1: ProviderResult, tier2: ProviderResult): ProviderResult {
  const tier2ByFile = new Map(tier2.photos.map((p) => [p.file, p]))
  const photos = tier1.photos.map((first) => {
    if (first.resolution?.kind === 'exact' && first.breweryPrinted !== false) return first
    const second = tier2ByFile.get(first.file)
    return second ? { ...second, latencyMs: first.latencyMs + second.latencyMs } : first
  })
  return { key: label, photos }
}

/** Load a photo file into a Blob the way the scan action would receive it. */
function fileToBlob(absPath: string): Blob {
  const bytes = readFileSync(absPath)
  const ext = path.extname(absPath).toLowerCase()
  const type = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  return new Blob([bytes], { type })
}

async function main() {
  console.log(`# label-scan-jp eval — ${new Date().toISOString()}`)

  // ---- Ground truth ----
  if (!existsSync(GROUND_TRUTH_PATH)) {
    throw new Error(`ground-truth.json not found at ${GROUND_TRUTH_PATH}`)
  }
  const groundTruth = GroundTruthFileSchema.parse(
    JSON.parse(readFileSync(GROUND_TRUTH_PATH, 'utf8')),
  )

  // ---- Providers ----
  const providerKeys = resolveProviderList()
  console.log(`Providers: ${providerKeys.join(', ')}`)
  console.log(`Throttle: ${THROTTLE_MS}ms between real-provider calls`)
  const saved = loadSavedReads()
  if (OFFLINE) console.log(`Offline: saved reads only, no model is called.`)
  if (FRESH) console.log(`Fresh: saved reads ignored, every photo is read again.`)
  const canResolve = Boolean(process.env.DATABASE_URL)
  if (!canResolve) {
    console.log(`DATABASE_URL is not set — scoring the extraction only, not where the scan lands.`)
  }
  console.log(``)

  // ---- Build the corpus ----
  const publishedPhotoFiles = listImages(PHOTOS_DIR)
  const localPhotoFiles = listImages(LOCAL_PHOTOS_DIR)
  const misplaced = photosInTheWrongFolder(groundTruth, publishedPhotoFiles, localPhotoFiles)
  if (misplaced.length > 0) {
    console.error(`Photos in the wrong folder (photos/ is published, photos/local/ is not):`)
    for (const line of misplaced) console.error(`- ${line}`)
    process.exitCode = 1
    return
  }
  const realPhotoFiles = [...publishedPhotoFiles, ...localPhotoFiles].sort()
  const localPhotos = new Set(localPhotoFiles)
  const includeSmoke =
    process.env.LABEL_SCAN_EVAL_INCLUDE_SMOKE === '1' || realPhotoFiles.length === 0
  const smokeAvailable = existsSync(path.join(FIXTURES_DIR, SMOKE_FIXTURE))

  const candidateFiles: Array<{ file: string; absPath: string }> = [
    ...realPhotoFiles.map((f) => ({
      file: f,
      absPath: path.join(localPhotos.has(f) ? LOCAL_PHOTOS_DIR : PHOTOS_DIR, f),
    })),
    ...(includeSmoke && smokeAvailable
      ? [{ file: SMOKE_FIXTURE, absPath: path.join(FIXTURES_DIR, SMOKE_FIXTURE) }]
      : []),
  ]

  // Pair each file with its ground truth; report + skip anything unusable.
  const corpus: CorpusEntry[] = []
  const skipped: Array<{ file: string; reason: string }> = []
  for (const { file, absPath } of candidateFiles) {
    const gt = groundTruth[file]
    if (!gt) {
      skipped.push({ file, reason: 'no ground-truth entry (add one keyed by this filename)' })
      continue
    }
    if (!gt.provenance.rightsCleared) {
      skipped.push({ file, reason: 'rights not cleared (set provenance.rightsCleared: true)' })
      continue
    }
    corpus.push({ file, absPath, groundTruth: gt })
  }

  // Ground-truth entries pointing at a file that is not on disk (e.g. the
  // shipped placeholders) — surface them so the convention is obvious.
  const onDiskNames = new Set(candidateFiles.map((c) => c.file))
  const missingFiles = Object.keys(groundTruth).filter((k) => !onDiskNames.has(k))

  const clearedRealPhotos = corpus.filter((c) => c.file !== SMOKE_FIXTURE).length

  // ---- Degraded-corpus messaging ----
  if (clearedRealPhotos < TARGET_PHOTO_COUNT) {
    console.log(`> ⚠️  DEGRADED CORPUS`)
    console.log(
      `> ${clearedRealPhotos}/${TARGET_PHOTO_COUNT} rights-cleared real photos present in evals/label-scan-jp/photos/.`,
    )
    if (clearedRealPhotos === 0) {
      console.log(
        `> No real photos yet — running against the synthetic smoke fixture only, which just proves the pipeline works.`,
      )
    }
    console.log(
      `> The comparison table below is NOT a meaningful provider ranking until 20 real photos are added.`,
    )
    console.log(`> See evals/label-scan-jp/README.md → "MAINTAINER TODO".`)
    console.log(``)
  }

  if (skipped.length > 0) {
    console.log(`## Skipped inputs`)
    for (const s of skipped) console.log(`- ${s.file} — ${s.reason}`)
    console.log(``)
  }
  if (missingFiles.length > 0) {
    console.log(`## Ground-truth entries with no file on disk (placeholders / not-yet-added)`)
    for (const f of missingFiles) console.log(`- ${f}`)
    console.log(``)
  }

  if (corpus.length === 0) {
    console.log(
      `No scorable inputs. Add photos to evals/label-scan-jp/photos/ with matching, rights-cleared ground-truth entries, then re-run.`,
    )
    return
  }

  console.log(`Scoring ${corpus.length} image(s) across ${providerKeys.length} provider(s).`)
  console.log(``)

  // ---- Run: provider → photo, strictly serial ----
  const providerResults: ProviderResult[] = []

  for (const key of providerKeys) {
    console.log(`## Provider: ${key}`)
    const spent = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    let provider
    try {
      provider = getVisionProvider(key, {
        onUsage: (u) => {
          spent.inputTokens += u.inputTokens
          spent.outputTokens += u.outputTokens
          spent.cacheReadTokens += u.cacheReadTokens
          spent.cacheWriteTokens += u.cacheWriteTokens
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`  construction failed: ${message}`)
      console.log(``)
      providerResults.push({ key, photos: [], constructionError: message })
      continue
    }

    // Saved reads made with another prompt are of no use to this run.
    const fingerprint = providerFingerprint(key)
    const previous = saved.providers[key]
    const reads: Record<string, SavedRead> = previous?.fingerprint === fingerprint ? previous.reads : {}
    saved.providers[key] = { fingerprint, reads }
    let reused = 0
    let called = 0

    const photos: PhotoResult[] = []
    for (let i = 0; i < corpus.length; i++) {
      const { file, absPath, groundTruth: gt } = corpus[i]
      process.stdout.write(`  ${file.padEnd(62)} ... `)
      const blob = fileToBlob(absPath)
      const photoSha = sha(new Uint8Array(await blob.arrayBuffer()))
      const reusable = FRESH ? undefined : reads[file]
      const savedRead = reusable && reusable.photoSha === photoSha ? reusable : undefined
      const t0 = performance.now()
      try {
        let extraction: LabelScanExtraction
        let latencyMs: number
        if (savedRead && 'name_ja' in savedRead) {
          extraction = {
            name_ja: savedRead.name_ja,
            brewery_ja: savedRead.brewery_ja,
            brewery_printed: savedRead.brewery_printed,
            subject: savedRead.subject,
            drink: savedRead.drink,
            bottling: savedRead.bottling,
            other_names: savedRead.other_names,
            confidence: savedRead.confidence,
            source: 'llm_extracted',
          }
          latencyMs = savedRead.latencyMs
          reused++
        } else if (savedRead && !FRESH && OFFLINE) {
          throw new Error(savedRead.error)
        } else if (OFFLINE) {
          throw new Error(NO_SAVED_READ)
        } else {
          if (called > 0 && key !== 'e2e-stub' && THROTTLE_MS > 0) await sleep(THROTTLE_MS)
          called++
          const callStart = performance.now()
          extraction = await provider.extractLabel(blob)
          latencyMs = Math.round(performance.now() - callStart)
          reads[file] = {
            photoSha,
            name_ja: extraction.name_ja,
            brewery_ja: extraction.brewery_ja,
            brewery_printed: extraction.brewery_printed,
            subject: extraction.subject,
            drink: extraction.drink,
            bottling: extraction.bottling,
            other_names: extraction.other_names,
            confidence: extraction.confidence,
            latencyMs,
          }
        }
        const nameAccuracy = fieldAccuracy(gt.name_ja, gt.also?.name_ja, extraction.name_ja)
        const breweryAccuracy = fieldAccuracy(gt.brewery_ja, gt.also?.brewery_ja, extraction.brewery_ja)
        const exactMatch = nameAccuracy === 1 && breweryAccuracy === 1
        const resolution =
          canResolve && canJudge(gt) ? await resolveAndJudge(extraction, gt) : undefined
        photos.push({
          file,
          view: gt.view,
          resolution,
          nameAccuracy,
          breweryAccuracy,
          exactMatch,
          latencyMs,
          status: 'ok',
          extractedNameJa: extraction.name_ja,
          extractedBreweryJa: extraction.brewery_ja,
          breweryPrinted: extraction.brewery_printed,
          otherNames: extraction.other_names,
          confidence: extraction.confidence,
        })
        console.log(
          `${exactMatch ? 'EXACT' : '     '} name=${nameAccuracy.toFixed(2)} brewery=${breweryAccuracy.toFixed(2)} ${latencyMs}ms  → ${extraction.name_ja} / ${extraction.brewery_ja}${extraction.other_names?.length ? ` [+ ${extraction.other_names.join(', ')}]` : ''} @${extraction.confidence.toFixed(2)}${resolution ? `  ⇒ ${resolution.verdict} (${resolution.kind} ${resolution.landedOn})` : ''}`,
        )
      } catch (err) {
        const latencyMs = Math.round(performance.now() - t0)
        const message = err instanceof Error ? err.message : String(err)
        if (!OFFLINE) reads[file] = { photoSha, error: message }
        photos.push({
          file,
          view: gt.view,
          nameAccuracy: 0,
          breweryAccuracy: 0,
          exactMatch: false,
          latencyMs,
          status: 'error',
          detail: message,
        })
        console.log(`ERROR ${message}`)
      }

    }
    providerResults.push({ key, photos })
    const price = PRICES[key]
    // Cached input is priced apart: a write at 1.25x, a read at 0.1x
    // (0.05x on Sonnet 5.5 and Opus 5.5).
    const readRate = key.startsWith('anthropic-sonnet-5-5') ? 0.05 : 0.1
    const plainInput = spent.inputTokens - spent.cacheReadTokens - spent.cacheWriteTokens
    const dollars = price
      ? ((plainInput + spent.cacheWriteTokens * 1.25 + spent.cacheReadTokens * readRate) * price[0] +
          spent.outputTokens * price[1]) /
        1e6
      : null
    console.log(
      `  ${reused} saved read(s) reused, ${called} model call(s)` +
        (called > 0
          ? `: ${spent.inputTokens} tokens in (${spent.cacheReadTokens} read from cache, ${spent.cacheWriteTokens} written), ${spent.outputTokens} out${dollars === null ? '' : `, about $${dollars.toFixed(3)} at list prices`}.`
          : '.'),
    )
    console.log(``)
  }

  // The stub reads nothing; keeping its answers would only churn the file.
  delete saved.providers['e2e-stub']
  if (!OFFLINE) writeFileSync(SAVED_READS_PATH, `${JSON.stringify(saved, null, 1)}\n`)

  for (const pair of TIER_PAIRS) {
    const tier1 = providerResults.find((r) => r.key === pair.tier1 && !r.constructionError)
    const tier2 = providerResults.find((r) => r.key === pair.tier2 && !r.constructionError)
    if (canResolve && tier1 && tier2) providerResults.push(replayTwoTier(pair.label, tier1, tier2))
  }

  // The headline tables count photos of one sake bottle only; a shochu, a
  // menu or two bottles in one frame are judged by other rules and reported
  // apart, so adding them never moves "right of N".
  const kindOf = new Map<string, PhotoKind>(corpus.map((c) => [c.file, photoKind(c.groundTruth)]))
  const isSakeBottle = (p: PhotoResult) => kindOf.get(p.file) === 'sake_bottle'
  const sakeBottles = providerResults.map((r) => ({ ...r, photos: r.photos.filter(isSakeBottle) }))
  const otherKinds = providerResults.map((r) => ({ ...r, photos: r.photos.filter((p) => !isSakeBottle(p)) }))
  const sakeBottleCount = corpus.filter((c) => photoKind(c.groundTruth) === 'sake_bottle').length

  printUnreadPhotos(providerResults)
  printComparisonTable(sakeBottles, sakeBottleCount)
  if (canResolve) printResolutionTable(sakeBottles)
  if (corpus.length > sakeBottleCount) printOtherKindsTable(otherKinds, kindOf, canResolve)
  printPerPhotoDetail(providerResults)
  // The lookup holds a pg pool open; the run is over.
  process.exit(0)
}

const VIEW_ORDER: readonly (PhotoView | 'all')[] = ['all', 'front', 'side', 'back_ja', 'back_import', 'other']

/** One row per provider and view: where the scans landed. */
function printResolutionTable(results: ProviderResult[]) {
  console.log(`## Where the scan landed`)
  console.log(``)
  console.log(`| provider | view | photos | right | in list | wrong | none | right rate | right ungated |`)
  console.log(`|----------|------|--------|-------|---------|-------|------|------------|---------------|`)
  for (const r of results) {
    if (r.constructionError) continue
    for (const view of VIEW_ORDER) {
      const judged = r.photos.filter((p) => (view === 'all' || p.view === view) && p.resolution)
      if (judged.length === 0) continue
      const count = (verdict: Verdict) => judged.filter((p) => p.resolution?.verdict === verdict).length
      const ungatedRight = judged.filter((p) => p.resolution?.ungatedVerdict === 'right').length
      console.log(
        `| ${r.key} | ${view} | ${judged.length} | ${count('right')} | ${count('in_list')} | ${count('wrong')} | ${count('none')} | ${(count('right') / judged.length).toFixed(3)} | ${ungatedRight} |`,
      )
    }
  }
  console.log(``)
}

/** The message an offline run gives a photo no model has read with this prompt. */
const NO_SAVED_READ = 'no saved read for this photo and prompt'

/**
 * Offline, a photo without a saved read is an error in every table below.
 * Say which photos those are, once, and what reading them costs.
 */
function printUnreadPhotos(results: ProviderResult[]) {
  const unread = results
    .map((r) => ({ key: r.key, files: r.photos.filter((p) => p.detail === NO_SAVED_READ).map((p) => p.file) }))
    .filter((r) => r.files.length > 0 && isVisionProviderKey(r.key))
  if (unread.length === 0) return
  const calls = unread.reduce((sum, r) => sum + r.files.length, 0)
  console.log(`## Not read yet`)
  console.log(``)
  console.log(
    `These photos have no saved read for the current prompt, so they count as errors below and are not judged. ` +
      `The same run without LABEL_SCAN_EVAL_OFFLINE reads exactly these and nothing else: ${calls} model call(s).`,
  )
  console.log(``)
  for (const r of unread) console.log(`- ${r.key}: ${r.files.length} photo(s)`)
  console.log(``)
  for (const file of [...new Set(unread.flatMap((r) => r.files))].sort()) {
    const by = unread.filter((r) => r.files.includes(file)).map((r) => r.key)
    console.log(`- ${file}${by.length === unread.length ? '' : ` (${by.join(', ')})`}`)
  }
  console.log(``)
}

const OTHER_KINDS: readonly { kind: PhotoKind; label: string }[] = [
  { kind: 'other_drink', label: 'not sake' },
  { kind: 'several_bottles', label: 'several bottles' },
  { kind: 'menu', label: 'menu' },
  { kind: 'no_bottle', label: 'no bottle' },
]

/**
 * One row per provider and kind, for the photos that are not one sake
 * bottle. `right` here means what `judge.ts` says it means for that kind —
 * mostly "no sake was shown" — so these rows are never added to the ones above.
 */
function printOtherKindsTable(results: ProviderResult[], kindOf: Map<string, PhotoKind>, canResolve: boolean) {
  console.log(`## Photos that are not one sake bottle`)
  console.log(``)
  if (!canResolve) {
    console.log(`Not judged: DATABASE_URL is not set. They are listed under "Per-photo detail".`)
    console.log(``)
    return
  }
  console.log(`| provider | kind | photos | not read | right | in photo | in list | wrong | none | right ungated |`)
  console.log(`|----------|------|--------|----------|-------|----------|---------|-------|------|---------------|`)
  for (const r of results) {
    if (r.constructionError) continue
    for (const { kind, label } of OTHER_KINDS) {
      const photos = r.photos.filter((p) => kindOf.get(p.file) === kind)
      if (photos.length === 0) continue
      const judged = photos.filter((p) => p.resolution)
      const count = (verdict: Verdict) => judged.filter((p) => p.resolution?.verdict === verdict).length
      const ungatedRight = judged.filter((p) => p.resolution?.ungatedVerdict === 'right').length
      console.log(
        `| ${r.key} | ${label} | ${photos.length} | ${photos.length - judged.length} | ${count('right')} | ${count('in_photo')} | ${count('in_list')} | ${count('wrong')} | ${count('none')} | ${ungatedRight} |`,
      )
    }
  }
  console.log(``)
  console.log(
    `right: no sake shown (or, where one bottle of several is clearly the subject, that bottle). ` +
      `in photo: a catalogue row for something in the frame that is not the answer. wrong: a sake that is not in the frame.`,
  )
  console.log(``)
}

function printComparisonTable(results: ProviderResult[], corpusSize: number) {
  console.log(`## Comparison (${corpusSize} photo(s) of one sake bottle)`)
  console.log(``)
  console.log(
    `| provider | scored | errors | name_ja acc | brewery_ja acc | exact-match rate | median latency (ms) |`,
  )
  console.log(
    `|----------|--------|--------|-------------|----------------|------------------|---------------------|`,
  )
  for (const r of results) {
    if (r.constructionError) {
      console.log(`| ${r.key} | — | — | construction failed | — | — | — |`)
      continue
    }
    const ok = r.photos.filter((p) => p.status === 'ok')
    const errors = r.photos.filter((p) => p.status === 'error').length
    const nameAcc = mean(ok.map((p) => p.nameAccuracy))
    const breweryAcc = mean(ok.map((p) => p.breweryAccuracy))
    const exactRate = ok.length ? ok.filter((p) => p.exactMatch).length / ok.length : 0
    const medLatency = median(ok.map((p) => p.latencyMs))
    console.log(
      `| ${r.key} | ${ok.length} | ${errors} | ${nameAcc.toFixed(3)} | ${breweryAcc.toFixed(3)} | ${exactRate.toFixed(3)} | ${medLatency} |`,
    )
  }
  console.log(``)
}

function printPerPhotoDetail(results: ProviderResult[]) {
  console.log(`## Per-photo detail`)
  console.log(``)
  console.log(
    `| provider | photo | status | name acc | brewery acc | exact | ms | extracted (name / brewery) | landed on |`,
  )
  console.log(
    `|----------|-------|--------|----------|-------------|-------|-----|-----------------------------|-----------|`,
  )
  for (const r of results) {
    if (r.constructionError) {
      console.log(`| ${r.key} | — | construction failed: ${r.constructionError} | — | — | — | — | — | — |`)
      continue
    }
    for (const p of r.photos) {
      const extracted =
        p.status === 'ok'
          ? `${p.extractedNameJa} / ${p.extractedBreweryJa}${p.otherNames?.length ? ` [+ ${p.otherNames.join(', ')}]` : ''} @${p.confidence?.toFixed(2)}`
          : `(${p.detail ?? 'error'})`
      const landed = p.resolution
        ? `${p.resolution.verdict} — ${p.resolution.kind} ${p.resolution.landedOn}`
        : '—'
      console.log(
        `| ${r.key} | ${p.file} | ${p.status} | ${p.nameAccuracy.toFixed(2)} | ${p.breweryAccuracy.toFixed(2)} | ${p.exactMatch ? 'yes' : 'no'} | ${p.latencyMs} | ${extracted} | ${landed} |`,
      )
    }
  }
  console.log(``)
}

main().catch((err) => {
  console.error('eval-label-scan-jp: fatal error', err)
  process.exit(1)
})
