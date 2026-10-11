import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test('a missing adapter explains that the browser may be hiding the GPU and gives recovery steps', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  await page.waitForFunction(
    () => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true',
    undefined,
    { timeout: 60_000 },
  )

  await page.evaluate(async () => {
    const path = '/src/render/failure.ts'
    const { showFailure } = await import(path)
    showFailure(document.querySelector<HTMLElement>('#app')!, 'no-adapter', 'requestAdapter returned null.')
  })

  await expect(page.getByRole('heading', { name: 'No usable graphics adapter was exposed' })).toBeVisible()
  await expect(page.getByText(/computer may still have a GPU/)).toBeVisible()
  await expect(page.getByText(/graphics acceleration when available/)).toBeVisible()
  await expect(page.getByText(/chrome:\/\/gpu|edge:\/\/gpu/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy diagnostics' })).toBeVisible()
  await expect(page.getByText('Advanced browser flags')).toBeVisible()
  await page.screenshot({ path: 'test-results/preflight-no-adapter-recovery.png', fullPage: true })
})
