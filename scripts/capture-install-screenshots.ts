/**
 * Captures the manifest's `screenshots`: what Chrome on Android shows in its
 * richer install dialog. Real app screens of the sample collection (made-up
 * tastings of real catalogue sakes), so no one's data is in them, at the
 * design's 390×844 phone size, twice the pixels.
 *
 *   VISION_PROVIDER=e2e-stub pnpm dev --port 3001
 *   pnpm tsx scripts/capture-install-screenshots.ts [base-url]
 *
 * The sample's "A sample collection · Leave" line and Next's dev badge are
 * hidden for the capture; the rest is the page as rendered. Rerun when these
 * screens change noticeably. Keep promotional copy and drinking out of them
 * (JMStV; the Play policy, if the app is ever listed there).
 */
import { firefox } from '@playwright/test'

const SCREENS = [
  { path: '/en/home', file: 'public/screenshots/home.png' },
  { path: '/en/profile', file: 'public/screenshots/palate.png' },
  { path: '/en/search?pref=13', file: 'public/screenshots/search.png' },
]

async function main(): Promise<void> {
  const base = process.argv[2] ?? 'http://localhost:3001'
  const browser = await firefox.launch()
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
    await context.addCookies([{ name: 'yawaragi_age_gate', value: JSON.stringify({ v: 1, ts: Date.now() }), url: base }])
    const page = await context.newPage()
    await page.goto(`${base}/api/sample-collection?locale=en`)
    for (const screen of SCREENS) {
      await page.goto(base + screen.path, { waitUntil: 'networkidle' })
      const reject = page.getByRole('button', { name: /reject/i })
      if (await reject.count()) await reject.first().click()
      await page.addStyleTag({ content: '[data-testid=sample-collection-banner],nextjs-portal{display:none!important}' })
      await page.waitForTimeout(800)
      await page.screenshot({ path: screen.file })
      console.log(`wrote ${screen.file}`)
    }
  } finally {
    await browser.close()
  }
}

void main()
