/**
 * Renders the home-screen icons (design v1.8, block O, option 1a) to PNG:
 * the 和 glyph in accent (#cf8a6e) on the ground's radial gradient, with the
 * short solid accent rule under it.
 *
 *   pnpm tsx scripts/render-app-icons.ts
 *
 * The design sets the glyph in Noto Serif JP 500 and asks for it exported as
 * outlines, so no font loads at runtime: this draws it once, with the system's
 * Noto Serif CJK JP (`fonts-noto-cjk` on Debian/Ubuntu), and the PNGs are
 * committed. Rerun only when the icon changes. Proportions are the design
 * file's (`design/Yawaragi App Icon.dc.html`): the maskable icon's glyph is
 * 150/256 of the side, inside the 80% safe circle; the "any" icons use the
 * 96px specimen's 58/96.
 */
import { firefox } from '@playwright/test'

interface IconSpec {
  file: string
  size: number
  /** Glyph size and rule geometry as fractions of the side. */
  glyph: number
  ruleBottom: number
  ruleWidth: number
  ruleHeight: number
  lift: number
}

const MASKABLE = { glyph: 150 / 256, ruleBottom: 44 / 256, ruleWidth: 56 / 256, ruleHeight: 2 / 256, lift: 6 / 256 }
const ANY = { glyph: 58 / 96, ruleBottom: 16 / 96, ruleWidth: 22 / 96, ruleHeight: 1.5 / 96, lift: 3 / 96 }

const ICONS: IconSpec[] = [
  { file: 'public/icons/icon-192.png', size: 192, ...ANY },
  { file: 'public/icons/icon-512.png', size: 512, ...ANY },
  { file: 'public/icons/icon-512-maskable.png', size: 512, ...MASKABLE },
  // iOS draws its own rounded mask over the square, as with "any".
  { file: 'src/app/apple-icon.png', size: 180, ...ANY },
]

function html(icon: IconSpec): string {
  const s = icon.size
  return `<!doctype html><html><body style="margin:0">
<div style="position:relative;width:${s}px;height:${s}px;background:radial-gradient(120% 90% at 30% 20%,#2a2826 0%,#1b1a19 60%);display:grid;place-items:center;overflow:hidden">
  <span lang="ja" style="font-family:'Noto Serif CJK JP';font-weight:500;font-size:${icon.glyph * s}px;line-height:1;color:#cf8a6e;transform:translateY(-${icon.lift * s}px)">和</span>
  <span style="position:absolute;left:50%;bottom:${icon.ruleBottom * s}px;width:${icon.ruleWidth * s}px;height:${Math.max(1, icon.ruleHeight * s)}px;margin-left:-${(icon.ruleWidth * s) / 2}px;background:#cf8a6e"></span>
</div></body></html>`
}

async function main(): Promise<void> {
  const browser = await firefox.launch()
  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size } })
      await page.setContent(html(icon))
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: icon.file, clip: { x: 0, y: 0, width: icon.size, height: icon.size } })
      await page.close()
      console.log(`wrote ${icon.file}`)
    }
  } finally {
    await browser.close()
  }
}

void main()
