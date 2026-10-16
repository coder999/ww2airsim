import { test, expect, type Locator, type Page } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { debriefDialog, diveToSea, quickLaunch, spawnUrl, startGame, toConditions, waitForScenario, wholeLabel, type DiagWindow } from './harness.js'

/**
 * E2E acceptance for the sortie forms (docs/superpowers/specs/2026-09-27-sortie-forms-design.md,
 * plan Task 8; reworked for plan F5B): what only the browser can prove -- the launch memos offer what the rules
 * allow, a Dev Zero really drops a bomb, the player is drawn as the chosen aircraft, and a quick launch flies and
 * records nothing. (The old AD-2 "a K.I.A. pilot is not resurrected by a Dev sortie" is gone with the resurrection:
 * a closed pilot never flies again, and Dev sorties never touch a campaign, see `campaignSortie.spec.ts`.)
 */
test.setTimeout(240_000)

const SHOTS = 'test-results'

const titleOf = (page: Page) => page.getByRole('dialog', { name: 'Title' })
const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const playerModel = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.playerModel())
const sceneAirframeModels = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.sceneAirframeModels())
const rows = (title: Locator, group: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio')
const radio = (title: Locator, group: string, name: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio', { name: wholeLabel(name) })
const next = (title: Locator) => title.getByRole('button', { name: 'Next' }).click()

/** Boots `url` and walks Headquarters to Flight Conditions for a picker row (see `toConditions`). */
async function toForms(page: Page, options: Parameters<typeof toConditions>[1] = {}, url = '/'): Promise<Locator> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(url)
  return toConditions(page, options)
}

test('a non-Dev carrier mission offers only carrier-capable allied aircraft; Dev adds the Zero, labeled Japanese; form captures', async ({ page }) => {
  const title = await toForms(page, { scenario: 'Carrier Qualification' })
  await page.screenshot({ path: `${SHOTS}/sortie-form-1.png` })
  await next(title)
  // Four since D1 (70cb2cb5) onboarded the carrier-capable TBM Avenger; its Kate is Japanese, so Dev-only.
  await expect(rows(title, 'Aircraft')).toHaveCount(4)
  await expect(radio(title, 'Aircraft', 'Grumman TBF/TBM Avenger')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Grumman F6F Hellcat')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Grumman F4F Wildcat')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Vought F4U Corsair')).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Aircraft' })).not.toContainText('Zero')
  await expect(title).toContainText('Structure hit points')
  await expect(title).toContainText('Engine power')
  await page.screenshot({ path: `${SHOTS}/sortie-form-3.png` })
  await next(title)
  await expect(radio(title, 'Loadout', 'Clean (recommended)')).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: `${SHOTS}/sortie-form-4.png` })

  // Dev on, the same mission: the Zero appears (labeled Japanese) beside every other airplane.
  const devTitle = await toForms(page, { scenario: 'Carrier Qualification', dev: true })
  await next(devTitle)
  await expect(rows(devTitle, 'Aircraft')).toHaveCount(readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).length)
  await expect(radio(devTitle, 'Aircraft', 'Mitsubishi A6M Zero (Japanese)')).toBeVisible()
})

test('a Dev Zero with bombs hangs its own stations, is drawn as the Zero, and releases a real bomb', async ({ page }) => {
  // The DEV spawn override puts the sortie in the air, so the release needs no takeoff (strike.spec.ts's pattern).
  const title = await toForms(page, { scenario: 'Free Flight', dev: true }, spawnUrl({ x: 0, y: 1500, z: 0 }))
  await next(title)
  await radio(title, 'Aircraft', 'Mitsubishi A6M Zero (Japanese)').click()
  await next(title)
  await radio(title, 'Loadout', 'Bombs').click()
  // Since 495941c (2026-09-29) the Zero has its own stores block, so the Dev
  // fallback to the Hellcat's stations (and its note) no longer applies.
  await expect(title).not.toContainText('dev layout')
  // Since V2 (66d38d90) every Japanese bomber carries the Type 98 No. 25, not the AN-M65.
  await expect(title).toContainText('2 × Type 98 No. 25')
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  await waitForScenario(page, 'free-flight')
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('a6m2-zero-blender')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['a6m2-zero-blender', 'a6m2-zero-blender'])
  await expect.poll(() => combat(page).then((c) => c.player.stores.bombs), { timeout: 10_000 }).toBe(2)
  await page.screenshot({ path: `${SHOTS}/sortie-dev-zero-bombs.png` })
  await page.keyboard.press('KeyV')
  await expect.poll(() => combat(page).then((c) => c.player.stores.bombs), { timeout: 5_000 }).toBe(1)
  expect((await combat(page)).projectiles).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('the Wildcat offers only Clean and Bombs on the armament form (W1: no rockets)', async ({ page }) => {
  const title = await toForms(page, { scenario: 'Carrier Qualification' })
  await next(title)
  await radio(title, 'Aircraft', 'Grumman F4F Wildcat').click()
  await next(title)
  await expect(rows(title, 'Loadout')).toHaveCount(2)
  await expect(radio(title, 'Loadout', 'Clean (recommended)')).toBeVisible()
  await expect(radio(title, 'Loadout', 'Bombs')).toBeVisible()
})

test('the player is drawn as the chosen aircraft, and an aircraft-only change rebuilds it (Review Focus 5)', async ({ page }) => {
  // Airborne (the DEV spawn override), so `diveToSea` can end each flight; the URL keeps it on every return.
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: 0, y: 1500, z: 0 }))
  await startGame(page)
  await expect(titleOf(page)).toBeHidden()
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f6f-hellcat-blender')
  // Free Flight's second airframe is its parked axis Zero (6ce00eb, 2026-09-28).
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['f6f-hellcat-blender', 'a6m2-zero-blender'])
  await page.screenshot({ path: `${SHOTS}/sortie-default-hellcat.png` })

  // Back to Headquarters the debrief's way: dive in, then "Return to Headquarters".
  await diveToSea(page)
  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()
  await startGame(page, { aircraft: 'Wildcat' })
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f4f-wildcat-blender')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['f4f-wildcat-blender', 'a6m2-zero-blender'])

  await diveToSea(page)
  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()
  await startGame(page, { aircraft: 'Hellcat' })
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f6f-hellcat-blender')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['f6f-hellcat-blender', 'a6m2-zero-blender'])
})

test('a quick launch flies without Headquarters, and its debrief says the sortie was not recorded', async ({ page }) => {
  // Air Combat starts airborne, so `diveToSea` can end it (it only pushes the nose down).
  await quickLaunch(page, { scenario: 'pursuit-range', aircraft: 'f4f-wildcat', loadout: 'clean' })
  await expect(titleOf(page)).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Headquarters' })).toHaveCount(0)
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f4f-wildcat-blender')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
  await diveToSea(page)
  await expect(debriefDialog(page)).toContainText('Dev sortie: not recorded')
  await page.screenshot({ path: `${SHOTS}/sortie-quick-launch-debrief.png` })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign())).toBeNull()
})

test('unchecking Dev drops the Dev-only rows from the picker', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await toConditions(page, { scenario: 'Free Flight' }) // creates the campaign on the way
  await page.reload()
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const front = page.getByRole('dialog', { name: 'Headquarters' })
  await front.getByRole('button', { name: /^Open / }).first().click()
  await front.getByRole('checkbox', { name: /Dev: unlocks/ }).check()
  await front.getByRole('button', { name: /Training grounds & single missions/ }).click()
  await expect(front.getByRole('radio', { name: /Furball \(dev\)/ })).toBeVisible()
  await front.getByRole('button', { name: 'Back' }).click()
  await front.getByRole('checkbox', { name: /Dev: unlocks/ }).uncheck()
  await front.getByRole('button', { name: /Training grounds & single missions/ }).click()
  await expect(front.getByRole('radio', { name: /Furball/ })).toHaveCount(0)
  await expect(front.getByRole('radio', { name: /Free Flight/ })).toBeVisible()
})
