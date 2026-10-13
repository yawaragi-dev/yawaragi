import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { photosInTheWrongFolder } from './photo-folders'
import { GroundTruthFileSchema, type GroundTruthFile } from './schemas'

const HERE = path.dirname(fileURLToPath(import.meta.url))

function entry(localOnly?: boolean): GroundTruthFile[string] {
  return {
    name_ja: '七田',
    brewery_ja: '天山酒造',
    provenance: { source: 'maintainer_menu_photo', rightsCleared: true, ...(localOnly ? { localOnly } : {}) },
  }
}

describe('photosInTheWrongFolder', () => {
  it('accepts a published photo in photos/ and a local-only one in photos/local/', () => {
    const groundTruth = { 'list.jpg': entry(), 'designed.jpg': entry(true) }
    expect(photosInTheWrongFolder(groundTruth, ['list.jpg'], ['designed.jpg'])).toEqual([])
  })

  it('stops a local-only photo that sits where git would publish it', () => {
    const problems = photosInTheWrongFolder({ 'designed.jpg': entry(true) }, ['designed.jpg'], [])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('move it to photos/local/')
  })

  it('stops a photo kept local without the ground truth saying so', () => {
    const problems = photosInTheWrongFolder({ 'list.jpg': entry() }, [], ['list.jpg'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('not marked localOnly')
  })

  it('stops a photo that is in both folders', () => {
    const problems = photosInTheWrongFolder({ 'list.jpg': entry(true) }, ['list.jpg'], ['list.jpg'])
    expect(problems).toEqual(['list.jpg is in both photos/ and photos/local/; keep one.'])
  })
})

describe('a menu photo', () => {
  it('has to say whether it is published', () => {
    const undecided = { 'menu.jpg': entry() }
    expect(GroundTruthFileSchema.safeParse(undecided).success).toBe(false)
    const decided = { 'menu.jpg': { ...entry(), provenance: { ...entry().provenance, localOnly: false } } }
    expect(GroundTruthFileSchema.safeParse(decided).success).toBe(true)
  })
})

describe('the photos in this checkout', () => {
  it('has no local-only photo in the published folder', () => {
    const groundTruth = GroundTruthFileSchema.parse(
      JSON.parse(readFileSync(path.join(HERE, 'ground-truth.json'), 'utf8')),
    )
    const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [])
    const photos = path.join(HERE, 'photos')
    expect(photosInTheWrongFolder(groundTruth, list(photos), list(path.join(photos, 'local')))).toEqual([])
  })
})
