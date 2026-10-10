import { test, expect, type Locator, type Page } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { debriefDialog, diveToSea, quickLaunch, spawnUrl, startGame, waitForScenario, wholeLabel, type DiagWindow } from './harness.js'

/**
 * E2E acceptance for the sortie forms (docs/superpowers/specs/2026-09-27-sortie-forms-design.md,
 * plan Task 8): what only the browser can prove -- the forms offer what the rules allow, a Dev
 * Zero really drops a bomb, the player is drawn as the chosen aircraft, a quick launch flies
 * and records nothing, and a K.I.A. pilot is not resurrected by a Dev sortie (addendum AD-2).
 */
test.setTimeout(240_000)

const SHOTS = 'test-results'
const DEV = 'Dev — unlocks everything'
const ROSTER_KEY = 'ww2airsim.roster.v1'

const titleOf = (page: Page) => page.getByRole('dialog', { name: 'Title' })
const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const playerModel = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.playerModel())
const sceneAirframeModels = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.sceneAirframeModels())
const rows = (title: Locator, group: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio')
const radio = (title: Locator, group: string, name: string) => title.getByRole('radiogroup', { name: group }).getByRole('radio', { name: wholeLabel(name) })
const next = (title: Locator) => title.getByRole('button', { name: 'Next' }).click()

async function newPilot(page: Page, name: string, url = '/'): Promise<Locator> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(url)
  const title = titleOf(page)
  await expect(title).toBeVisible()
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill(name)
  await title.getByRole('button', { name: 'Add' }).click()
  return title
}

const rosterJson = (page: Page) => page.evaluate((k) => window.localStorage.getItem(k), ROSTER_KEY)

test('a non-Dev carrier mission offers only carrier-capable allied aircraft; Dev adds the Zero, labeled Japanese; four form captures', async ({ page }) => {
  const title = await newPilot(page, 'Carrier Pilot')
  await page.screenshot({ path: `${SHOTS}/sortie-form-1.png` })
  await title.getByRole('button', { name: 'New game' }).click()
  await radio(title, 'Scenario', 'Carrier Qualification').click()
  await expect(title.getByRole('region', { name: 'Briefing' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/sortie-form-2.png` })
  await next(title)
  // Four since D1 (70cb2cb5) onboarded the carrier-capable TBM Avenger; its Kate is Japanese, so Dev-only.
  await expect(rows(title, 'Aircraft')).toHaveCount(4)
  await expect(radio(title, 'Aircraft', 'Grumman TBF/TBM Avenger')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Grumman F6F Hellcat')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Grumman F4F Wildcat')).toBeVisible()
  await expect(radio(title, 'Aircraft', 'Vought F4U Corsair')).toBeVisible()
  await expect(title.getByRole('radiogroup', { name: 'Aircraft' })).not.toContainText('Zero')
  await page.screenshot({ path: `${SHOTS}/sortie-form-3.png` })
  await next(title)
  await expect(radio(title, 'Loadout', 'Clean (recommended)')).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: `${SHOTS}/sortie-form-4.png` })

  // Back to Form 1, check Dev, and the Zero appears on the same mission.
  for (let i = 0; i < 3; i++) await title.getByRole('button', { name: 'Back' }).click()
  await title.getByRole('checkbox', { name: DEV }).check()
  await title.getByRole('button', { name: 'New game' }).click()
  await next(title)
  await expect(rows(title, 'Aircraft')).toHaveCount(readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).length)
  await expect(radio(title, 'Aircraft', 'Mitsubishi A6M Zero (Japanese)')).toBeVisible()
})

test('a Dev Zero with bombs hangs its own stations, is drawn as the Zero, and releases a real bomb', async ({ page }) => {
  // The DEV spawn override puts the sortie in the air, so the release needs no takeoff (strike.spec.ts's pattern).
  const title = await newPilot(page, 'Dev Zero Pilot', spawnUrl({ x: 0, y: 1500, z: 0 }))
  await title.getByRole('checkbox', { name: DEV }).check()
  await title.getByRole('button', { name: 'New game' }).click()
  await radio(title, 'Scenario', 'Free Flight').click()
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
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('a6m2-zero')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['a6m2-zero', 'a6m2-zero'])
  await expect.poll(() => combat(page).then((c) => c.player.stores.bombs), { timeout: 10_000 }).toBe(2)
  await page.screenshot({ path: `${SHOTS}/sortie-dev-zero-bombs.png` })
  await page.keyboard.press('KeyV')
  await expect.poll(() => combat(page).then((c) => c.player.stores.bombs), { timeout: 5_000 }).toBe(1)
  expect((await combat(page)).projectiles).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('the Wildcat offers only Clean and Bombs on the armament form (W1: no rockets)', async ({ page }) => {
  const title = await newPilot(page, 'Racks Pilot')
  await title.getByRole('button', { name: 'New game' }).click()
  await radio(title, 'Scenario', 'Carrier Qualification').click()
  await next(title)
  await radio(title, 'Aircraft', 'Grumman F4F Wildcat').click()
  await next(title)
  await expect(rows(title, 'Loadout')).toHaveCount(2)
  await expect(radio(title, 'Loadout', 'Clean (recommended)')).toBeVisible()
  await expect(radio(title, 'Loadout', 'Bombs')).toBeVisible()
})

test('the player is drawn as the chosen aircraft, and an aircraft-only change rebuilds it (Review Focus 5)', async ({ page }) => {
  // Airborne (the DEV spawn override), so `diveToSea` can end each flight; the URL keeps it on every return.
  const title = await newPilot(page, 'Model Pilot', spawnUrl({ x: 0, y: 1500, z: 0 }))
  await startGame(page)
  await expect(title).toBeHidden()
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f6f-hellcat')
  // Free Flight's second airframe is its parked axis Zero (6ce00eb, 2026-09-28).
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['f6f-hellcat', 'a6m2-zero'])
  await page.screenshot({ path: `${SHOTS}/sortie-default-hellcat.png` })

  // Return to title the debrief's way: dive in, then "Return to title".
  await diveToSea(page)
  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()
  await startGame(page, { aircraft: 'Wildcat' })
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('wildcat')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['wildcat', 'a6m2-zero'])

  await diveToSea(page)
  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()
  await startGame(page, { aircraft: 'Hellcat' })
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('f6f-hellcat')
  await expect.poll(() => sceneAirframeModels(page), { timeout: 30_000 }).toEqual(['f6f-hellcat', 'a6m2-zero'])
})

test('a quick launch flies without the title, and its debrief says the sortie was not recorded', async ({ page }) => {
  await newPilot(page, 'Bystander')
  const before = await rosterJson(page)
  // Air Combat starts airborne, so `diveToSea` can end it (it only pushes the nose down).
  await quickLaunch(page, { scenario: 'pursuit-range', aircraft: 'f4f-wildcat', loadout: 'clean' })
  await expect(titleOf(page)).toBeHidden()
  await expect.poll(() => playerModel(page), { timeout: 30_000 }).toBe('wildcat')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 60_000 })
  await diveToSea(page)
  await expect(debriefDialog(page)).toContainText('Dev sortie: not recorded')
  await page.screenshot({ path: `${SHOTS}/sortie-quick-launch-debrief.png` })
  expect(await rosterJson(page)).toBe(before)
})

test('unchecking Dev drops a Dev-only mission back to Free Flight', async ({ page }) => {
  const title = await newPilot(page, 'Toggle Pilot')
  await title.getByRole('checkbox', { name: DEV }).check()
  await title.getByRole('button', { name: 'New game' }).click()
  await radio(title, 'Scenario', 'Furball (dev)').click()
  await title.getByRole('button', { name: 'Back' }).click()
  await title.getByRole('checkbox', { name: DEV }).uncheck()
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title.getByRole('radiogroup', { name: 'Scenario' })).not.toContainText('Furball')
  await expect(radio(title, 'Scenario', 'Free Flight')).toHaveAttribute('aria-checked', 'true')
})

for (const status of ['kia', 'discharged'] as const) {
  test(`AD-2: a ${status} pilot launching a Dev sortie is not resurrected; a normal sortie would be`, async ({ page }) => {
    const name = status === 'kia' ? 'Fallen Pilot' : 'Discharged Pilot'
    await newPilot(page, name)
    // Mark the pilot the way the app stores it, then reload so the title reads it.
    await page.evaluate(([k, n, st]) => {
      const roster = JSON.parse(window.localStorage.getItem(k)!) as { name: string; status: string }[]
      for (const p of roster) if (p.name === n) p.status = st
      window.localStorage.setItem(k, JSON.stringify(roster))
    }, [ROSTER_KEY, name, status] as const)
    const read = () => page.evaluate(([k, n]) => (JSON.parse(window.localStorage.getItem(k)!) as { name: string; status: string; resurrections: number }[]).find((p) => p.name === n)!, [ROSTER_KEY, name] as const)
    await page.reload()
    const before = await read()
    expect(before.status).toBe(status)

    // An illegal choice without Dev (the Zero with bombs), so it genuinely needs Dev.
    await startGame(page, { dev: true, scenario: 'Free Flight', aircraft: 'Zero', loadout: 'Bombs' })
    await expect(titleOf(page)).toBeHidden()
    await waitForScenario(page, 'free-flight')
    const after = await read()
    expect(after.status).toBe(status)
    expect(after.resurrections).toBe(before.resurrections)

    await page.reload()
    const restoredTitle = titleOf(page)
    await expect(restoredTitle).toBeVisible()
    await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
    await expect(restoredTitle.locator('button[aria-pressed]').filter({ hasText: name })).toHaveAccessibleName(
      new RegExp(`${name} — ENS — 0 — ${status === 'kia' ? 'KIA' : 'DISCHARGED'}$`),
    )

    // Control: the same pilot on the default, legal sortie is resurrected -- the test can see it.
    await startGame(page)
    await expect(titleOf(page)).toBeHidden()
    const control = await read()
    expect(control.status).toBe('active')
    expect(control.resurrections).toBe(before.resurrections + 1)
  })
}
