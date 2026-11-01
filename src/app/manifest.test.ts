// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import manifest from './manifest'

const publicDir = path.join(process.cwd(), 'public')

/** Width and height from a PNG's IHDR chunk (bytes 16–23). */
function readPng(src: string, dir = publicDir) {
  const bytes = readFileSync(path.join(dir, src))
  expect(bytes.subarray(1, 4).toString('ascii'), `${src} is not a PNG`).toBe('PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

const ground = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8').match(
  /--color-ground:\s*(#[0-9a-f]{6})/i,
)?.[1]

describe('the installed app', () => {
  const m = manifest()
  const images = [
    ...(m.icons ?? []),
    ...(m.screenshots ?? []),
    ...(m.shortcuts ?? []).flatMap((shortcut) => shortcut.icons ?? []),
  ]

  it('has an icon, screenshot and shortcut image at every size the manifest promises', () => {
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      const { width, height } = readPng(image.src)
      expect(`${width}x${height}`, image.src).toBe(image.sizes)
    }
  })

  it('offers the 192 and 512 icons a phone needs, and a maskable one for Android', () => {
    const sizes = (m.icons ?? []).map((icon) => icon.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect((m.icons ?? []).some((icon) => icon.purpose === 'maskable')).toBe(true)
  })

  it('opens on the Ginshu ground, so the splash and status bar match the app', () => {
    expect(ground).toBeDefined()
    expect(m.background_color?.toLowerCase()).toBe(ground?.toLowerCase())
    expect(m.theme_color?.toLowerCase()).toBe(ground?.toLowerCase())
  })

  it('gives iPhone a 180 px home-screen icon', () => {
    expect(readPng('apple-icon.png', path.join(process.cwd(), 'src/app'))).toEqual({ width: 180, height: 180 })
  })

  it('stays installable from the web: standalone, scoped to the site, no redirect to a store', () => {
    expect(m.display).toBe('standalone')
    expect(m.scope).toBe('/')
    expect(m.start_url?.startsWith('/')).toBe(true)
    // `prefer_related_applications` without a Play listing suppresses Chrome's web install (#480).
    expect(m.prefer_related_applications).toBeUndefined()
  })
})
