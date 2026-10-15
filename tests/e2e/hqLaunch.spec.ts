import { expect, test, type Page } from '@playwright/test'
import { openDevCampaign, startCampaignGame, waitForScenario, type DiagWindow } from './harness.js'

/**
 * From Headquarters to a flying aircraft (plan F5B Task 8). A scored sortie launches through the campaign reducer
 * (a pending sortie appears); an unscored one (Training, Single Missions) launches nothing in the campaign. Banking
 * and the debrief are Task 10.
 */
test.setTimeout(180_000)

const campaign = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2?.campaign() ?? null)
const titleOf = (page: Page) => page.getByRole('dialog', { name: 'Title' })

test('a scored mission: pick, assign, Conditions, Aircraft, Ordnance, Launch; Back keeps the choices; the sortie is pending', async ({ page }) => {
  const hq = await openDevCampaign(page)
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await hq.getByRole('radio', { name: /Airfield Strike/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await expect(hq.getByText('Squadron Roster')).toBeVisible()
  await hq.getByRole('button', { name: /^Assign / }).first().click()

  // the three launch memos, numbered Step 3 to 5 of 5, in the title overlay; the HQ is out of the way
  const title = titleOf(page)
  await expect(hq).toHaveCount(0)
  await expect(title.getByText('Flight Conditions')).toBeVisible()
  await expect(title.getByText('Step 3 of 5')).toBeVisible()
  await expect(title.locator('dd:visible', { hasText: /^ENS / })).toBeVisible()

  // Back returns to the pilot step with the mission still chosen
  await title.getByRole('button', { name: 'Back' }).first().click()
  const hq2 = page.getByRole('dialog', { name: 'Headquarters' })
  await expect(hq2.getByText('Squadron Roster')).toBeVisible()
  await expect(hq2.getByText('Airfield Strike')).toBeVisible()
  await hq2.getByRole('button', { name: /^Assign / }).first().click()

  await title.getByRole('button', { name: 'Next' }).first().click()
  await expect(title.getByText('Step 4 of 5')).toBeVisible()
  await title.getByRole('button', { name: 'Next' }).first().click()
  await expect(title.getByText('Step 5 of 5')).toBeVisible()
  await expect(title.getByText(/Difficulty: (Recruit|Veteran|Ace)\. Change it in Settings\./)).toBeVisible()
  await expect(campaign(page)).resolves.toMatchObject({ pending: null })
  await title.getByRole('button', { name: 'Launch' }).click()

  await expect(title).toBeHidden()
  await waitForScenario(page, 'airfield-strike')
  const c = await campaign(page)
  expect(c?.pending).toMatchObject({ missionId: 'airfield-strike' })
  expect(c?.human.sorties).toBe(1)
  expect(c?.live.filter((p) => p.sorties === 1)).toHaveLength(1)
})

test('a Training Grounds row goes through the same steps and launches nothing in the campaign', async ({ page }) => {
  const hq = await openDevCampaign(page)
  await hq.getByRole('button', { name: /Training grounds & single missions/ }).click()
  await hq.getByRole('radio', { name: /Free Flight/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await hq.getByRole('button', { name: /^Assign / }).first().click()
  const title = titleOf(page)
  await title.getByRole('button', { name: 'Next' }).first().click()
  await title.getByRole('button', { name: 'Next' }).first().click()
  await expect(title.getByText(/Not recorded: Training: not scored/)).toBeVisible()
  await title.getByRole('button', { name: 'Launch' }).click()
  await waitForScenario(page, 'free-flight')
  const c = await campaign(page)
  expect(c?.pending).toBeNull()
  expect(c?.human.sorties).toBe(0)
  expect(c?.revision).toBe(0)
})

test('Dev God mode makes a scored mission unrecorded, and says so on the last memo', async ({ page }) => {
  const hq = await openDevCampaign(page)
  await hq.getByRole('checkbox', { name: /^God mode:/ }).check()
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await hq.getByRole('radio', { name: /Convoy Strike/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await hq.getByRole('button', { name: /^Assign / }).first().click()
  const title = titleOf(page)
  await title.getByRole('button', { name: 'Next' }).first().click()
  await title.getByRole('button', { name: 'Next' }).first().click()
  await expect(title.getByText(/Not recorded: God mode: not recorded/)).toBeVisible()
  await title.getByRole('button', { name: 'Launch' }).click()
  await waitForScenario(page, 'convoy-strike')
  expect((await campaign(page))?.pending).toBeNull()
})

test('a night test bed launched from Headquarters keeps its authored hour and lights; a day mission gets the Dev note instead', async ({ page }) => {
  const hq = await openDevCampaign(page)
  await hq.getByRole('button', { name: /Training grounds & single missions/ }).click()
  await hq.getByRole('radio', { name: /Night Range/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await hq.getByRole('button', { name: /^Assign / }).first().click()
  const title = titleOf(page)
  // locked to the authored night hour: one row, no Morning, Midday or Dusk to turn it into day
  await expect(title.getByRole('radio', { name: /Authored time \(2100\)/ })).toBeVisible()
  await expect(title.getByRole('radio', { name: /Morning|Midday|Dusk/ })).toHaveCount(0)
  await title.getByRole('button', { name: 'Next' }).first().click()
  await title.getByRole('button', { name: 'Next' }).first().click()
  await title.getByRole('button', { name: 'Launch' }).click()
  await waitForScenario(page, 'night-range')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2?.lights().length ?? 0), { timeout: 30_000 }).toBeGreaterThan(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2?.lights().some((l) => l.lit) ?? false)).toBe(true)
})

test('on a day mission the Dev night takeoff choices carry the note that no lights are authored', async ({ page }) => {
  const hq = await openDevCampaign(page)
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await hq.getByRole('radio', { name: /Convoy Strike/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await hq.getByRole('button', { name: /^Assign / }).first().click()
  const title = titleOf(page)
  await expect(title.getByRole('radio', { name: /Night \(dev\)/ })).toBeVisible()
  await expect(title.getByText(/Dev: no runway lights on this mission yet/)).toBeVisible()
})

test('Convoy Strike with the Avenger: Form 5 offers exactly the mission list, and the launch is accepted (Mark, CP3)', async ({ page }) => {
  await page.goto('/')
  await startCampaignGame(page, { scenario: 'Convoy Strike', aircraft: 'Avenger' })
  await waitForScenario(page, 'convoy-strike')
  const c = await campaign(page)
  expect(c?.pending).toMatchObject({ missionId: 'convoy-strike', aircraft: 'tbm-3-avenger' })
})

test('Form 5 shows only the mission\'s own aircraft', async ({ page }) => {
  const hq = await openDevCampaign(page) // Dev on...
  await hq.getByRole('checkbox', { name: /Dev: unlocks/ }).uncheck() // ...then off: the list applies
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await hq.getByRole('radio', { name: /Convoy Strike/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await hq.getByRole('button', { name: /^Assign / }).first().click()
  const title = titleOf(page)
  await title.getByRole('button', { name: 'Next' }).first().click()
  const aircraft = title.getByRole('radiogroup', { name: 'Aircraft' }).getByRole('radio')
  await expect(aircraft).toHaveCount(3)
  await expect(aircraft.filter({ hasText: /Hellcat/ })).toHaveCount(1)
  await expect(aircraft.filter({ hasText: /Corsair/ })).toHaveCount(1)
  await expect(aircraft.filter({ hasText: /Avenger/ })).toHaveCount(1)
})
