import { expect, test } from '@playwright/test'
import { startGame, type DiagWindow } from './harness.js'

test.setTimeout(120_000)

test('pause dossier exposes live mission records, the navigation chart, and confirmed sortie actions', async ({ page }) => {
  await page.goto('/')
  await startGame(page, { scenario: 'Airfield Strike' })
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 120, undefined, {
    timeout: 60_000,
  })

  await page.keyboard.press('Escape')
  const pause = page.getByRole('dialog', { name: 'Pause menu' })
  await expect(pause).toBeVisible()
  await expect(pause.getByText('Mission Paused')).toBeVisible()
  await expect(pause.getByText('SORTIE ACTIVE')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Debrief' })).toBeHidden()

  const tabs = ['Tally', 'Map', 'Mission Description', 'Controls', 'Visual Quality'] as const
  for (const label of tabs) await expect(pause.getByRole('tab', { name: label })).toBeVisible()
  for (const label of ['Resume', 'Restart Mission', 'Abort Mission']) {
    await expect(pause.getByRole('button', { name: label })).toBeVisible()
  }

  // The live tally deliberately places unbanked mission kills next to the
  // pilot record's career kills and reports authoritative objective states.
  const tally = pause.getByRole('tabpanel', { name: 'Tally' })
  await expect(tally.getByRole('table', { name: 'Kill tally' })).toBeVisible()
  await expect(tally.getByRole('columnheader', { name: 'This sortie' })).toBeVisible()
  await expect(tally.getByRole('columnheader', { name: 'Career' })).toBeVisible()
  await expect(tally.getByRole('row', { name: /^Total 0 0$/ })).toBeVisible()
  const objectives = tally.getByLabel('Mission objectives')
  await expect(objectives).toBeVisible()
  await expect(objectives.getByText(/ACTIVE|COMPLETE|FAILED|PENDING/).first()).toBeVisible()

  // The Map tab is the shipped P-key chart mounted inline: same chart image,
  // terrain/objective content, navigation selection, zoom and pan handlers.
  await pause.getByRole('tab', { name: 'Map' }).click()
  const embeddedMap = pause.getByRole('region', { name: 'Mission map' })
  await expect(embeddedMap).toBeVisible()
  await expect(embeddedMap.getByRole('img', { name: 'Navigation chart, north at the top' })).toBeVisible()
  await expect(embeddedMap.getByText(/Scroll to zoom, drag to pan/)).toBeVisible()
  await embeddedMap.getByRole('button', { name: /^Set .* as navigation destination$/ }).first().click()
  await expect(embeddedMap.getByText(/Course \d{3}°/)).toBeVisible()
  for (const label of ['Resume', 'Restart Mission', 'Abort Mission']) {
    await expect(pause.getByRole('button', { name: label })).toBeVisible()
  }

  await pause.getByRole('tab', { name: 'Mission Description' }).click()
  const mission = pause.getByRole('tabpanel', { name: 'Mission Description' })
  await expect(mission.getByRole('region', { name: 'Briefing' })).toBeVisible()
  await expect(mission.getByText('Briefing', { exact: true })).toBeVisible()

  await pause.getByRole('tab', { name: 'Controls' }).click()
  const controls = pause.getByRole('tabpanel', { name: 'Controls' })
  await expect(controls.getByRole('row', { name: /Guns Space bar/ })).toBeVisible()
  await expect(controls.getByRole('row', { name: /Throttle.*Num \+/ })).toBeVisible()
  await expect(controls.getByRole('row', { name: /Navigation chart P/ })).toBeVisible()

  // The quality tab opens settings.ts's real dialog and live model, scoped to
  // visual rows exactly like the main-menu entry.
  await pause.getByRole('tab', { name: 'Visual Quality' }).click()
  await pause.getByRole('button', { name: 'Open Visual Quality Settings' }).click()
  const quality = page.getByRole('dialog', { name: 'Visual quality settings' })
  await expect(quality).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Render quality' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Render scale' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Asset quality' })).toBeVisible()
  await expect(quality.getByRole('radiogroup', { name: 'Damage model' })).toHaveCount(0)
  await quality.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio', { name: /Low\b/ }).click()
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('ww2airsim.quality.v1')!))).toEqual({
    ocean: 'low', scenery: 'low', clouds: 'low', fx: 'low',
  })
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.oceanTier() === 'low')
  await quality.getByRole('button', { name: 'Close' }).click()
  await expect(pause).toBeVisible()

  // Restart and Abort both require a second, explicit acknowledgement. The
  // safe choice and Escape preserve the held world and return to the folder.
  const beforeCancel = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  await pause.getByRole('button', { name: 'Restart Mission' }).click()
  const confirmation = page.getByRole('alertdialog', { name: 'Mission action confirmation' })
  await expect(confirmation.getByText('Current mission progress and kills will be lost.')).toBeVisible()
  await expect(confirmation.getByRole('button', { name: 'Restart Mission' })).toBeVisible()
  await confirmation.getByRole('button', { name: 'Keep Flying' }).click()
  await expect(pause).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(beforeCancel)

  await pause.getByRole('button', { name: 'Abort Mission' }).click()
  await expect(confirmation.getByText(/sortie will end without a debrief or score/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirmation).toBeHidden()
  await expect(pause).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(beforeCancel)

  // Confirming Restart uses the one authoritative restart path.
  await pause.getByRole('button', { name: 'Restart Mission' }).click()
  await confirmation.getByRole('button', { name: 'Restart Mission' }).click()
  await expect(pause).toBeHidden()
  await page.waitForFunction((tick) => (window as DiagWindow).__ww2!.tick() < tick, beforeCancel)

  // P outside the dossier still opens the modal form of the same chart.
  await page.keyboard.press('KeyP')
  const standaloneMap = page.getByRole('dialog', { name: 'Navigation chart' })
  await expect(standaloneMap.getByRole('img', { name: 'Navigation chart, north at the top' })).toBeVisible()
  await expect(standaloneMap.getByText(/Scroll to zoom, drag to pan/)).toBeVisible()
  await standaloneMap.getByRole('button', { name: 'Close navigation chart' }).click()

  // Confirming Abort discards the unbanked sortie and returns to the title,
  // without producing a debrief.
  await page.keyboard.press('Escape')
  await pause.getByRole('button', { name: 'Abort Mission' }).click()
  await confirmation.getByRole('button', { name: 'Abort Mission' }).click()
  await expect(confirmation).toBeHidden()
  await expect(pause).toBeHidden()
  await expect(page.locator('[data-ww2-title]')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Debrief' })).toBeHidden()
})
