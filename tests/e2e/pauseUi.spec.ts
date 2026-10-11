import { expect, test } from '@playwright/test'
import { startGame, type DiagWindow } from './harness.js'

test.setTimeout(120_000)

test('pause menu keeps the sortie active and shares controls, map, and live visual-quality UI', async ({ page }) => {
  await page.goto('/')
  await startGame(page)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 120, undefined, {
    timeout: 60_000,
  })

  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Pause menu' })
  await expect(pause).toBeVisible()
  await expect(pause.getByText('Mission Paused')).toBeVisible()
  await expect(pause.getByText('SORTIE ACTIVE')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Debrief' })).toBeHidden()
  for (const label of ['Resume', 'View Map', 'Controls', 'Visual Quality', 'Restart Mission']) {
    await expect(pause.getByRole('button', { name: label })).toBeVisible()
  }

  // This is a real pause sub-screen, populated from the same binding catalog
  // as the in-flight legend. Back and Escape navigate up without unpausing.
  await pause.getByRole('button', { name: 'Controls' }).click()
  const controls = page.getByRole('dialog', { name: 'Controls' })
  await expect(controls).toBeVisible()
  await expect(pause).toBeHidden()
  await expect(controls.getByRole('row', { name: /Guns Space bar/ })).toBeVisible()
  await expect(controls.getByRole('row', { name: /Throttle.*Num \+/ })).toBeVisible()
  await expect(controls.getByRole('row', { name: /Navigation chart P/ })).toBeVisible()
  await controls.getByRole('button', { name: 'Back' }).click()
  await expect(pause).toBeVisible()

  const beforeControlsEscape = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await pause.getByRole('button', { name: 'Controls' }).click()
  await page.keyboard.press('Escape')
  await expect(controls).toBeHidden()
  await expect(pause).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(beforeControlsEscape)

  // This is settings.ts's real dialog and live model, scoped to visual rows:
  // the quality pick reaches both persistence and the running ocean, while
  // mid-sortie gameplay choices are deliberately absent.
  await pause.getByRole('button', { name: 'Visual Quality' }).click()
  const quality = page.getByRole('dialog', { name: 'Visual quality settings' })
  await expect(quality).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Render quality' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Render scale' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Asset quality' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Damage model' })).toHaveCount(0)
  await expect(quality.getByRole('radiogroup', { name: 'Difficulty' })).toHaveCount(0)
  await quality.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio', { name: /Low\b/ }).click()
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('ww2airsim.quality.v1')!))).toEqual({
    ocean: 'low', scenery: 'low', clouds: 'low', fx: 'low',
  })
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.oceanTier() === 'low')
  await quality.getByRole('button', { name: 'Close' }).click()
  await expect(pause).toBeVisible()

  await pause.getByRole('button', { name: 'View Map' }).click()
  const chart = page.getByRole('dialog', { name: 'Navigation chart' })
  await expect(chart).toBeVisible()
  await expect(pause).toBeHidden()
  await chart.getByRole('button', { name: 'Close navigation chart' }).click()
  await expect(pause).toBeVisible()

  const beforeResume = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await pause.getByRole('button', { name: 'Resume' }).click()
  await expect(pause).toBeHidden()
  await page.waitForFunction((tick) => (window as DiagWindow).__ww2!.tick() > tick, beforeResume)

  await page.keyboard.press('Escape')
  await expect(pause).toBeVisible()
  const beforeRestart = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await pause.getByRole('button', { name: 'Restart Mission' }).click()
  await expect(pause).toBeHidden()
  await page.waitForFunction((tick) => (window as DiagWindow).__ww2!.tick() < tick, beforeRestart)
})
