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
 * rate, and median latency — one row per provider.
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

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  DEFAULT_VISION_PROVIDER_KEY,
  VISION_PROVIDER_KEYS,
  getVisionProvider,
  type VisionProviderKey,
} from '@/lib/ai/vision/registry'
import { charAccuracy } from '~/evals/label-scan-jp/levenshtein'
import {
  GroundTruthFileSchema,
  type GroundTruthEntry,
} from '~/evals/label-scan-jp/schemas'

const EVAL_DIR = fileURLToPath(new URL('../evals/label-scan-jp', import.meta.url))
const PHOTOS_DIR = path.join(EVAL_DIR, 'photos')
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

interface PhotoResult {
  file: string
  nameAccuracy: number
  breweryAccuracy: number
  exactMatch: boolean
  latencyMs: number
  status: 'ok' | 'error'
  detail?: string
  extractedNameJa?: string
  extractedBreweryJa?: string
}

interface ProviderResult {
  key: VisionProviderKey
  photos: PhotoResult[]
  constructionError?: string
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
  console.log(``)

  // ---- Build the corpus ----
  const realPhotoFiles = listImages(PHOTOS_DIR)
  const includeSmoke =
    process.env.LABEL_SCAN_EVAL_INCLUDE_SMOKE === '1' || realPhotoFiles.length === 0
  const smokeAvailable = existsSync(path.join(FIXTURES_DIR, SMOKE_FIXTURE))

  const candidateFiles: Array<{ file: string; absPath: string }> = [
    ...realPhotoFiles.map((f) => ({ file: f, absPath: path.join(PHOTOS_DIR, f) })),
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
    let provider
    try {
      provider = getVisionProvider(key)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`  construction failed: ${message}`)
      console.log(``)
      providerResults.push({ key, photos: [], constructionError: message })
      continue
    }

    const photos: PhotoResult[] = []
    for (let i = 0; i < corpus.length; i++) {
      const { file, absPath, groundTruth: gt } = corpus[i]
      process.stdout.write(`  ${file.padEnd(36)} ... `)
      const blob = fileToBlob(absPath)
      const t0 = performance.now()
      try {
        const extraction = await provider.extractLabel(blob)
        const latencyMs = Math.round(performance.now() - t0)
        const nameAccuracy = charAccuracy(gt.name_ja, extraction.name_ja)
        const breweryAccuracy = charAccuracy(gt.brewery_ja, extraction.brewery_ja)
        const exactMatch =
          extraction.name_ja === gt.name_ja && extraction.brewery_ja === gt.brewery_ja
        photos.push({
          file,
          nameAccuracy,
          breweryAccuracy,
          exactMatch,
          latencyMs,
          status: 'ok',
          extractedNameJa: extraction.name_ja,
          extractedBreweryJa: extraction.brewery_ja,
        })
        console.log(
          `${exactMatch ? 'EXACT' : '     '} name=${nameAccuracy.toFixed(2)} brewery=${breweryAccuracy.toFixed(2)} ${latencyMs}ms  → ${extraction.name_ja} / ${extraction.brewery_ja}`,
        )
      } catch (err) {
        const latencyMs = Math.round(performance.now() - t0)
        const message = err instanceof Error ? err.message : String(err)
        photos.push({
          file,
          nameAccuracy: 0,
          breweryAccuracy: 0,
          exactMatch: false,
          latencyMs,
          status: 'error',
          detail: message,
        })
        console.log(`ERROR ${message}`)
      }

      // Serial throttle — skip for the no-network stub and after the last photo.
      if (key !== 'e2e-stub' && i < corpus.length - 1 && THROTTLE_MS > 0) {
        await sleep(THROTTLE_MS)
      }
    }
    providerResults.push({ key, photos })
    console.log(``)
  }

  printComparisonTable(providerResults, corpus.length)
  printPerPhotoDetail(providerResults)
}

function printComparisonTable(results: ProviderResult[], corpusSize: number) {
  console.log(`## Comparison (${corpusSize} image(s))`)
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
    `| provider | photo | status | name acc | brewery acc | exact | ms | extracted (name / brewery) |`,
  )
  console.log(
    `|----------|-------|--------|----------|-------------|-------|-----|-----------------------------|`,
  )
  for (const r of results) {
    if (r.constructionError) {
      console.log(`| ${r.key} | — | construction failed: ${r.constructionError} | — | — | — | — | — |`)
      continue
    }
    for (const p of r.photos) {
      const extracted =
        p.status === 'ok'
          ? `${p.extractedNameJa} / ${p.extractedBreweryJa}`
          : `(${p.detail ?? 'error'})`
      console.log(
        `| ${r.key} | ${p.file} | ${p.status} | ${p.nameAccuracy.toFixed(2)} | ${p.breweryAccuracy.toFixed(2)} | ${p.exactMatch ? 'yes' : 'no'} | ${p.latencyMs} | ${extracted} |`,
      )
    }
  }
  console.log(``)
}

main().catch((err) => {
  console.error('eval-label-scan-jp: fatal error', err)
  process.exit(1)
})
