/**
 * `pnpm eval list-read-jp` — how well a whole menu or shelf is read and
 * matched (design v1.7 §7), on the label-scan corpus's menu and shelf photos
 * and their per-line `items`. See `evals/list-read-jp/README.md`.
 *
 * Every model read is saved to `evals/list-read-jp/recordings/reads.json`
 * with the tokens it used, keyed by model and by the prompt it was made with;
 * a later run reuses it unless the prompt or the photo changed. Matching runs
 * fresh every time against `DATABASE_URL`, so a lookup change is measured at
 * no model cost.
 *
 *   LIST_READ_EVAL_MODELS=sonnet-5-5,haiku-5-5   which readers (default: sonnet-5-5)
 *   LIST_READ_EVAL_OFFLINE=1                     saved reads only; says what a real run would read
 *   LIST_READ_EVAL_ONLY=<substring>              only photos whose name contains it
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { createAnthropicListReader, LIST_READ_PROMPTS } from '@/lib/ai/vision/list-reader'
import { lookupFlavorChart } from '@/lib/sakenowa/catalogue-reads'
import { resolveScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import { matchList } from '@/lib/scan/match-list'
import { ListScanExtractionSchema, type ListScanExtraction } from '@/lib/schemas/list-scan-extraction'
import { GroundTruthFileSchema, type GroundTruthEntry } from '~/evals/label-scan-jp/schemas'
import { judgeList, type ListVerdict } from '~/evals/list-read-jp/judge'

const LABEL_EVAL_DIR = fileURLToPath(new URL('../evals/label-scan-jp', import.meta.url))
const EVAL_DIR = fileURLToPath(new URL('../evals/list-read-jp', import.meta.url))
const SAVED_READS_PATH = path.join(EVAL_DIR, 'recordings', 'reads.json')
const OFFLINE = process.env.LIST_READ_EVAL_OFFLINE === '1'
const ONLY = process.env.LIST_READ_EVAL_ONLY ?? ''

/** Readers a run may compare: a model and a reasoning effort. */
const MODELS = {
  'sonnet-5-5': { id: 'claude-sonnet-5-5', price: [2, 10] },
  'haiku-5-5': { id: 'claude-haiku-5-5', price: [0.1, 0.5] },
  'sonnet-5-5-low': { id: 'claude-sonnet-5-5', effort: 'low', price: [2, 10] },
  'haiku-5-5-low': { id: 'claude-haiku-5-5', effort: 'low', price: [0.1, 0.5] },
} as const satisfies Record<string, { id: string; effort?: 'low'; price: readonly [number, number] }>
type ModelKey = keyof typeof MODELS

const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
})
type Usage = z.infer<typeof UsageSchema>

const SavedReadSchema = z.union([
  z.object({ photoSha: z.string(), latencyMs: z.number(), usage: UsageSchema, read: ListScanExtractionSchema }),
  z.object({ photoSha: z.string(), error: z.string() }),
])
const SavedReadsSchema = z.object({
  models: z.record(z.string(), z.object({ fingerprint: z.string(), reads: z.record(z.string(), SavedReadSchema) })),
})
type SavedReads = z.infer<typeof SavedReadsSchema>

const sha = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 16)
const FINGERPRINT = sha(`${LIST_READ_PROMPTS.system}\n${JSON.stringify(LIST_READ_PROMPTS.user)}`)

function modelList(): ModelKey[] {
  const raw = (process.env.LIST_READ_EVAL_MODELS ?? 'sonnet-5-5').split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = raw.filter((k) => !(k in MODELS))
  if (unknown.length > 0) throw new Error(`Unknown model(s): ${unknown.join(', ')}. Known: ${Object.keys(MODELS).join(', ')}.`)
  return [...new Set(raw)] as ModelKey[]
}

function loadSaved(): SavedReads {
  if (!existsSync(SAVED_READS_PATH)) return { models: {} }
  return SavedReadsSchema.parse(JSON.parse(readFileSync(SAVED_READS_PATH, 'utf8')))
}

function writeSaved(saved: SavedReads): void {
  mkdirSync(path.dirname(SAVED_READS_PATH), { recursive: true })
  writeFileSync(SAVED_READS_PATH, `${JSON.stringify(saved, null, 1)}\n`)
}

interface Photo {
  file: string
  absPath: string
  entry: GroundTruthEntry
  kind: 'menu' | 'shelf'
}

function corpus(): Photo[] {
  const gt = GroundTruthFileSchema.parse(JSON.parse(readFileSync(path.join(LABEL_EVAL_DIR, 'ground-truth.json'), 'utf8')))
  const dirs = [path.join(LABEL_EVAL_DIR, 'photos'), path.join(LABEL_EVAL_DIR, 'photos', 'local')]
  const photos: Photo[] = []
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).sort()) {
      const entry = gt[file]
      if (!entry || !entry.provenance.rightsCleared || !entry.items) continue
      if (entry.subject !== 'menu' && entry.subject !== 'several_bottles') continue
      if (ONLY && !file.includes(ONLY)) continue
      photos.push({ file, absPath: path.join(dir, file), entry, kind: entry.subject === 'menu' ? 'menu' : 'shelf' })
    }
  }
  return photos
}

interface PhotoResult {
  photo: Photo
  read?: ListScanExtraction
  error?: string
  latencyMs?: number
  verdict?: ListVerdict
  shown?: string[]
}

const median = (values: number[]) => {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function dollars(usage: Usage, price: readonly [number, number]): number {
  const plain = usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens
  return ((plain + usage.cacheWriteTokens * 1.25 + usage.cacheReadTokens * 0.1) * price[0] + usage.outputTokens * price[1]) / 1e6
}

async function main() {
  console.log(`# list-read-jp eval — ${new Date().toISOString()}`)
  const models = modelList()
  const photos = corpus()
  const saved = loadSaved()
  console.log(`Readers: ${models.join(', ')} · ${photos.length} photo(s): ${photos.filter((p) => p.kind === 'menu').length} menus, ${photos.filter((p) => p.kind === 'shelf').length} shelves`)
  if (OFFLINE) console.log('Offline: saved reads only, no model is called.')
  console.log('')

  for (const key of models) {
    const spec = MODELS[key]
    const bucket = saved.models[key]?.fingerprint === FINGERPRINT ? saved.models[key] : { fingerprint: FINGERPRINT, reads: {} }
    saved.models[key] = bucket
    let spent: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
    let fresh = 0
    const notRead: string[] = []
    const results: PhotoResult[] = []

    for (const photo of photos) {
      const bytes = readFileSync(photo.absPath)
      const photoSha = sha(bytes)
      const prior = bucket.reads[photo.file]
      let result: PhotoResult = { photo }
      if (prior && prior.photoSha === photoSha) {
        result = 'error' in prior ? { photo, error: prior.error } : { photo, read: prior.read, latencyMs: prior.latencyMs }
      } else if (OFFLINE) {
        notRead.push(photo.file)
        results.push(result)
        continue
      } else {
        let usage: Usage | undefined
        const reader = createAnthropicListReader({
          model: anthropic(spec.id),
          ...('effort' in spec ? { effort: spec.effort } : {}),
          onUsage: (u) => {
            usage = u
          },
        })
        const start = Date.now()
        try {
          const read = await reader.readList(new Blob([bytes], { type: 'image/jpeg' }), photo.kind)
          const latencyMs = Date.now() - start
          bucket.reads[photo.file] = { photoSha, latencyMs, usage: usage!, read }
          result = { photo, read, latencyMs }
          spent = addUsage(spent, usage!)
        } catch (err) {
          const error = err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : String(err)
          bucket.reads[photo.file] = { photoSha, error }
          result = { photo, error }
        }
        fresh++
        writeSaved(saved)
      }
      if (result.read) {
        const matched = await matchList(result.read, {
          resolve: (label) => resolveScannedLabel(label),
          chartFor: (id) => lookupFlavorChart(id),
          sakeHref: (id) => `/sake/${id}`,
        })
        const shownIds = matched.rows.map((r) => r.brandId)
        result.verdict = judgeList(photo.entry.items ?? [], shownIds)
        result.shown = matched.rows.map((r) => `${r.brandId}:${r.nameKanji}`)
      }
      results.push(result)
    }

    report(key, results, notRead)
    const all = Object.values(bucket.reads).flatMap((r) => ('usage' in r ? [r.usage] : []))
    const total = all.reduce(addUsage, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
    const perRead = all.length ? dollars(total, spec.price) / all.length : 0
    console.log(
      `Cost: ${fresh} new read(s) this run, about $${dollars(spent, spec.price).toFixed(3)}` +
        ` (${spent.cacheReadTokens} input tokens read from cache). Saved reads average $${perRead.toFixed(4)} each` +
        ` (${Math.round(total.inputTokens / Math.max(all.length, 1))} in, ${Math.round(total.outputTokens / Math.max(all.length, 1))} out).`,
    )
    if (notRead.length > 0) {
      console.log(`Not read yet (${notRead.length}): the same run without LIST_READ_EVAL_OFFLINE reads exactly these.`)
      for (const f of notRead) console.log(`  - ${f}`)
    }
    console.log('')
  }
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  }
}

function report(key: string, results: PhotoResult[], notRead: string[]) {
  const scored = results.filter((r) => r.verdict)
  const sum = (pick: (v: ListVerdict) => number) => scored.reduce((n, r) => n + pick(r.verdict!), 0)
  console.log(`## ${key}`)
  for (const kind of ['menu', 'shelf'] as const) {
    const mine = scored.filter((r) => r.photo.kind === kind)
    const s = (pick: (v: ListVerdict) => number) => mine.reduce((n, r) => n + pick(r.verdict!), 0)
    console.log(
      `${kind === 'menu' ? 'Menus  ' : 'Shelves'}: ${s((v) => v.found)} of ${s((v) => v.findable)} catalogue sakes found · ` +
        `${s((v) => v.wrongRows.length)} wrong row(s) · ${s((v) => v.notSakeShownAsSake.length)} non-sake shown as sake · ${mine.length} photo(s)`,
    )
  }
  console.log(
    `All    : ${sum((v) => v.found)} of ${sum((v) => v.findable)} found · ${sum((v) => v.wrongRows.length)} wrong row(s) · ` +
      `${results.filter((r) => r.error).length} failed read(s) · median ${(median(scored.flatMap((r) => (r.latencyMs ? [r.latencyMs] : []))) / 1000).toFixed(1)} s`,
  )
  console.log('')
  console.log('| photo | kind | found | missed | wrong rows | lines read | unreadable |')
  console.log('|---|---|---|---|---|---|---|')
  for (const r of results) {
    if (notRead.includes(r.photo.file)) continue
    if (r.error) {
      console.log(`| ${r.photo.file} | ${r.photo.kind} | — | — | — | failed: ${r.error.replace(/\|/g, '/')} | — |`)
      continue
    }
    const v = r.verdict!
    console.log(
      `| ${r.photo.file} | ${r.photo.kind} | ${v.found}/${v.findable} | ${v.missedItems.join(', ') || '—'} | ` +
        `${v.wrongRows.length ? r.shown!.filter((s) => v.wrongRows.includes(Number(s.split(':')[0]))).join(', ') : '—'} | ` +
        `${r.read!.lines.length} | ${r.read!.unreadable_count} |`,
    )
  }
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
