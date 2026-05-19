// Teaches: single Playwright spec walking every App Router primitive in /learn
import { test, expect } from '@playwright/test'

test.describe('/learn prototype', () => {
  test('root layout + sidebar parallel route render on index', async ({ page }) => {
    await page.goto('/learn')
    await expect(page.getByText('App Router Primitives')).toBeVisible()
    await expect(page.getByText('Navigation')).toBeVisible()
  })

  test('loading.tsx — segment exists (navigation does not 404)', async ({ page }) => {
    await page.goto('/learn')
    await expect(page).toHaveURL('/learn')
  })

  test('dynamic route [slug] renders param', async ({ page }) => {
    await page.goto('/learn/server-components')
    await expect(page.getByText('server components')).toBeVisible()
    await expect(page.getByText('server-components')).toBeVisible()
  })

  test('not-found.tsx — unknown slug triggers notFound()', async ({ page }) => {
    await page.goto('/learn/unknown-slug')
    await expect(page.getByText('404')).toBeVisible()
  })

  test('not-found.tsx — no matching route also shows not-found', async ({ page }) => {
    await page.goto('/learn/does-not-exist')
    await expect(page.getByText('404')).toBeVisible()
  })

  test('error.tsx — thrown server error is caught', async ({ page }) => {
    await page.goto('/learn/oops')
    await expect(page.getByText('error.tsx caught an unhandled error')).toBeVisible()
  })

  test('streaming Suspense boundary — fallback then content', async ({ page }) => {
    await page.goto('/learn')
    // The fallback text may be brief; wait for the streamed content
    await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 8000 })
  })

  test('server action + useActionState — form saves note', async ({ page }) => {
    await page.goto('/learn')
    await page.getByPlaceholder('Type a note…').fill('Hello App Router')
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Saved: "Hello App Router"')).toBeVisible()
  })

  test('server action — empty note returns validation message', async ({ page }) => {
    await page.goto('/learn')
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Note cannot be empty')).toBeVisible()
  })

  test('parallel route @sidebar — visible on dynamic route too', async ({ page }) => {
    await page.goto('/learn/caching')
    await expect(page.getByText('Navigation')).toBeVisible()
    await expect(page.getByText('caching')).toBeVisible()
  })

  test('intercepting route — item link from /learn shows modal overlay', async ({ page }) => {
    await page.goto('/learn')
    await page.getByRole('link', { name: 'item 1' }).click()
    await expect(page.getByText('intercepted modal')).toBeVisible()
    await expect(page.getByText('@modal/(.)item/1/page.tsx')).toBeVisible()
  })

  test('intercepting route — modal closes on router.back()', async ({ page }) => {
    await page.goto('/learn')
    await page.getByRole('link', { name: 'item 2' }).click()
    await expect(page.getByText('intercepted modal')).toBeVisible()
    await page.getByRole('button', { name: 'close (router.back())' }).click()
    await expect(page.getByText('App Router Primitives')).toBeVisible()
  })

  test('direct URL to item — shows full page, not modal', async ({ page }) => {
    await page.goto('/learn/item/3')
    await expect(page.getByText('Item 3 (full page)')).toBeVisible()
    await expect(page.getByText('intercepted modal')).not.toBeVisible()
  })
})
