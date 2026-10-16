import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { decodeFlightRecord } from '../../src/flightRecorder/codec.js'
import { startCampaignGame, startGame, type DiagWindow } from './harness.js'

test.setTimeout(120_000)

test('ordinary play has no recorder session, export control, or reproduction surface', async ({ page }) => {
  await page.goto('/')
  await startGame(page)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 60)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).toEqual({
    active: false,
    completed: false,
    packetCount: 0,
    valid: null,
    exported: false,
  })
  await expect(page.locator('[data-ww2-flight-recorder]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Export flight record' })).toHaveCount(0)
})

test('a Dev sortie records fixed ticks and exports a valid compressed .ww2flight', async ({ page }) => {
  await page.goto('/?flightRecorder=1')
  await expect(page.locator('[data-ww2-flight-recorder]')).toBeVisible()
  await startGame(page, { dev: true, scenario: 'Free Flight' })
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.flightRecorder().packetCount ?? 0) > 60)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).toMatchObject({
    active: true,
    completed: false,
    valid: true,
    exported: false,
  })

  await page.keyboard.press('Escape')
  const exportButton = page.getByRole('button', { name: 'Export flight record' })
  await expect(exportButton).toBeVisible()
  const pending = page.waitForEvent('download')
  await exportButton.click()
  const download = await pending
  expect(download.suggestedFilename()).toMatch(/^free-flight-.*\.ww2flight$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  const record = await decodeFlightRecord(new Uint8Array(await readFile(path!)))
  expect(record).toMatchObject({
    format: 'ww2flight',
    version: 1,
    valid: true,
    content: { scenarioId: 'free-flight' },
  })
  expect(record.packets.length).toBeGreaterThan(60)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder().exported)).toBe(true)

  const reproduction = page.locator('[data-ww2-flight-recorder]')
  await reproduction.locator('summary').click()
  await reproduction.getByLabel('Flight record file').setInputFiles(path!)
  await reproduction.getByRole('button', { name: 'Verify and inspect' }).click()
  // Replay mode hides the rest of the application surface; the status node
  // remains in the DOM with the verifier result while the replay bar owns the
  // visible UI.
  await expect(reproduction.locator('[role="status"]')).toContainText(/Verified \d+ ticks bit-identically/)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.replay())).not.toBeNull()
})

test('Dev checked on a scored mission still records and offers the export; the same mission without Dev does not', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Airfield Strike', dev: true })
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.flightRecorder().packetCount ?? 0) > 60)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).toMatchObject({ active: true, valid: true })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign()?.pending?.missionId)).toBe('airfield-strike')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Export flight record' })).toBeVisible()

  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Airfield Strike' })
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 60)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.flightRecorder())).active).toBe(false)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Export flight record' })).toHaveCount(0)
})
