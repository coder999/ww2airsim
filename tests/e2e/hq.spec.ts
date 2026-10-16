import { expect, test, type Page } from '@playwright/test'

/**
 * Headquarters (plan F5B Tasks 6 and 7). Reached with `?hq` until Task 10 makes it the front door. Asserts
 * visible state and storage, never pixels. A fixture campaign is imported through the real Import button, so the
 * import path is exercised by the setup itself.
 */
test.setTimeout(120_000)

/**
 * The F5A fixture builder (`tests/fixtures/campaign.ts`) runs in the page, served by the dev server, because the
 * campaign core reads JSON by import and Playwright's Node loader cannot. It builds the campaign through the real
 * reducers and returns the export text, so the Import button is exercised by the setup itself.
 */
async function archiveFixtureText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const load = (url: string): Promise<any> => import(/* @vite-ignore */ url) // eslint-disable-line @typescript-eslint/no-explicit-any
    const core = await load('/src/campaign/index.ts')
    const fx = await load('/tests/fixtures/campaign.ts')
    const grind = (id: string) => ({ id, faction: 'us', kind: 'noncampaign', chapterId: null, minTier: 1, night: false, coordinated: false, aircraftIds: ['f6f-hellcat'], scoreEligible: true, authoredBonus: 0, badgeId: null })
    let c = fx.makeCampaign({ faction: 'us', tiers: [1, 2, 3, 1, 1], id: 'fx-archive' })
    c = fx.flyThrough(c, 0, grind('convoy-strike'), { end: 'killed' })
    c = fx.flyThrough(c, 1, grind('tank-buster'), { end: 'captured' })
    c = fx.flyThrough(c, 3, grind('scramble'), { friendlyDestroyed: true })
    return core.exportCampaign(c) as string
  })
}

const hqOf = (page: Page) => page.getByRole('dialog', { name: 'Headquarters' })

async function openHq(page: Page): Promise<void> {
  await page.goto('/?hq')
  await hqOf(page).waitFor({ timeout: 60_000 })
}

async function newCampaign(page: Page, name: string, service: 'U.S. Navy' | 'Imperial Japanese Navy'): Promise<void> {
  const hq = hqOf(page)
  await hq.getByRole('button', { name: 'New campaign' }).click()
  await hq.getByPlaceholder('Player name').fill(name)
  await hq.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: new RegExp(service) }).click()
  await hq.getByRole('button', { name: 'Next' }).click()
  await hq.getByRole('button', { name: 'Enlist' }).click()
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
}

const stored = (page: Page, key: string): Promise<string | null> => page.evaluate((k) => localStorage.getItem(k), key)

test('create an American and a Japanese campaign: nothing is preselected, the name is required, both survive a reload', async ({ page }) => {
  await openHq(page)
  const hq = hqOf(page)
  await expect(hq.getByText('Personnel Files', { exact: true })).toBeVisible()
  await hq.getByRole('button', { name: 'New campaign' }).click()
  // no nation is checked by default
  await expect(hq.getByRole('radio', { checked: true })).toHaveCount(0)
  await hq.getByRole('button', { name: 'Next' }).click()
  await expect(hq.getByText(/Enter a player name/)).toBeVisible()
  await hq.getByPlaceholder('Player name').fill('Ada')
  await hq.getByRole('button', { name: 'Next' }).click()
  await expect(hq.getByText(/Choose the American or the Japanese service/)).toBeVisible()
  await hq.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: /U\.S\. Navy/ }).click()
  await hq.getByRole('button', { name: 'Next' }).click()
  await expect(hq.getByText('Enlist as Ada, U.S. Navy? This cannot be changed.')).toBeVisible()
  await hq.getByRole('button', { name: 'Enlist' }).click()

  // first view: five living pilots, all ACTIVE, with the Commander's dossier beside them
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  await expect(hq.locator('tbody tr')).toHaveCount(5)
  await expect(hq.getByText('ACTIVE')).toHaveCount(5)
  await expect(hq.getByText("Commander's Dossier")).toBeVisible()
  await expect(hq.getByText('Squadron Commander')).toBeVisible()
  await hq.getByRole('button', { name: /Switch campaign/ }).click()

  await newCampaign(page, 'Haruko', 'Imperial Japanese Navy')
  await expect(hq.getByText('Imperial Japanese Navy', { exact: true })).toBeVisible()
  await expect(hq.getByText('Kaigun Shōi', { exact: true }).first()).toBeVisible()
  await hq.getByRole('button', { name: /Switch campaign/ }).click()

  await page.reload()
  await hqOf(page).waitFor()
  await expect(hq.locator('tbody tr')).toHaveCount(2)
  await expect(hq.getByRole('button', { name: /^Open Ada, U\.S\. Navy/ })).toBeVisible()
  await expect(hq.getByRole('button', { name: /^Open Haruko, Imperial Japanese Navy/ })).toBeVisible()
})

test('a markup-laden player name shows literally, and a pilot dossier opens and closes with Escape', async ({ page }) => {
  await openHq(page)
  const hq = hqOf(page)
  await newCampaign(page, '<b>Ace</b>', 'U.S. Navy')
  await expect(hq.getByText('<b>Ace</b>').first()).toBeVisible()
  await hq.getByRole('button', { name: /^Dossier:/ }).first().click()
  const dossier = page.getByRole('dialog', { name: /^Dossier:/ })
  await expect(dossier).toBeVisible()
  await expect(dossier).toContainText('Ensign')
  await page.keyboard.press('Escape')
  await expect(dossier).toHaveCount(0)
  await hq.getByRole('button', { name: 'Full Dossier' }).click()
  await expect(page.getByRole('dialog', { name: /Commander's Dossier/ })).toContainText('Roster bonus')
  await page.keyboard.press('Escape')
})

test('the archive shows an imported campaign\'s losses by fate, newest first, and filters', async ({ page }) => {
  await openHq(page)
  const hq = hqOf(page)
  const fixture = await archiveFixtureText(page)
  const chooser = page.waitForEvent('filechooser')
  await hq.getByRole('button', { name: 'Import campaign' }).click()
  await (await chooser).setFiles({ name: 'fx.json', mimeType: 'application/json', buffer: Buffer.from(fixture) })
  await hq.getByRole('button', { name: /^Open Fixture/ }).click()
  await expect(hq.getByText('3 lost')).toBeVisible()
  await hq.getByRole('button', { name: /Pilot archive/ }).click()
  await expect(hq.locator('tbody tr')).toHaveCount(3)
  await expect(hq.getByRole('button', { name: /^K\.I\.A\. \(1\)/ })).toBeVisible()
  await hq.getByRole('button', { name: /^P\.O\.W\. \(1\)/ }).click()
  await expect(hq.locator('tbody tr')).toHaveCount(1)
  await expect(hq.locator('tbody tr')).toContainText('Tank Buster')
  await hq.getByRole('button', { name: /^Discharged \(1\)/ }).click()
  await expect(hq.locator('tbody tr')).toContainText('Scramble')
})

test('export then import: a clash offers Replace or Cancel (no Keep both); Cancel changes nothing; a roster array is rejected', async ({ page }, testInfo) => {
  await openHq(page)
  const hq = hqOf(page)
  await newCampaign(page, 'Exporter', 'U.S. Navy')
  await hq.getByRole('button', { name: /Save · export/ }).click()
  const download = page.waitForEvent('download')
  await hq.getByRole('button', { name: 'Export this campaign' }).click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^ww2airsim-american-.*-r\d+-\d{4}-\d{2}-\d{2}\.json$/)
  // saveAs, not path(): path() throws on a remote Playwright server (the nightly's route)
  const saved = testInfo.outputPath('export.json')
  await file.saveAs(saved)
  const text = Buffer.from(await (await import('node:fs/promises')).readFile(saved)).toString('utf8')

  const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))
  let chooser = page.waitForEvent('filechooser')
  await hq.getByRole('button', { name: 'Import a campaign file' }).click()
  await (await chooser).setFiles({ name: 'again.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await expect(hq.getByText('Campaign Already Saved')).toBeVisible()
  await expect(hq.getByRole('button', { name: /keep both/i })).toHaveCount(0)
  await expect(hq.getByRole('button', { name: 'Replace' })).toBeVisible()
  await hq.getByRole('button', { name: 'Cancel' }).click()
  expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(before)

  chooser = page.waitForEvent('filechooser')
  await hq.getByRole('button', { name: 'Import a campaign file' }).click()
  await (await chooser).setFiles({ name: 'again.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  await hq.getByRole('button', { name: 'Replace' }).click()
  await expect(hq.getByText(/Replaced the saved campaign/)).toBeVisible()

  chooser = page.waitForEvent('filechooser')
  await hq.getByRole('button', { name: 'Import a campaign file' }).click()
  await (await chooser).setFiles({ name: 'roster.json', mimeType: 'application/json', buffer: Buffer.from('[{"id":"x"}]') })
  await expect(hq.getByRole('alert')).toContainText('pre-campaign pilot roster')
})

test('a failed save shows the red banner with Export now; delete needs the typed word; the old roster key is purged at boot', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('roster-seeded') === null) { localStorage.setItem('ww2airsim.roster.v1', '[]'); sessionStorage.setItem('roster-seeded', '1') }
  })
  await openHq(page)
  const hq = hqOf(page)
  await newCampaign(page, 'Doomed', 'U.S. Navy')
  await hq.getByRole('button', { name: /Switch campaign/ }).click()
  // delete: the wrong word does nothing, the right one removes it
  await hq.getByRole('button', { name: /^Delete Doomed/ }).click()
  await hq.getByLabel('Type DELETE to confirm').fill('nope')
  await hq.getByRole('button', { name: 'Delete for good' }).click()
  await expect(hq.getByText('Type DELETE exactly to confirm.')).toBeVisible()
  await hq.getByLabel('Type DELETE to confirm').fill('DELETE')
  await hq.getByRole('button', { name: 'Delete for good' }).click()
  await expect(hq.getByText('No campaigns yet. Start one below.')).toBeVisible()
  expect(await stored(page, 'ww2airsim.roster.v1')).toBeNull()

  // storage that refuses writes: creating a campaign fails loudly instead of pretending
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceededError') } })
  await hq.getByRole('button', { name: 'New campaign' }).click()
  await hq.getByPlaceholder('Player name').fill('Nope')
  await hq.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: /U\.S\. Navy/ }).click()
  await hq.getByRole('button', { name: 'Next' }).click()
  await hq.getByRole('button', { name: 'Enlist' }).click()
  await expect(hq.getByText(/Could not save the campaign/)).toBeVisible()
})

test('Dev unlocks the dev buttons and dev rows inside the same picker; unchecked, none of it is visible', async ({ page }) => {
  await openHq(page)
  const hq = hqOf(page)
  await expect(hq.getByRole('button', { name: /Create dev campaign/ })).toHaveCount(0)
  await hq.getByRole('checkbox', { name: /Dev: unlocks/ }).check()
  await hq.getByRole('button', { name: 'Create dev campaign (U.S.)' }).click()
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await expect(hq.getByText('Night Range (dev)')).toBeVisible()
  await hq.getByRole('button', { name: 'Back' }).click()
  await hq.getByRole('checkbox', { name: /Dev: unlocks/ }).uncheck()
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await expect(hq.getByText('Night Range (dev)')).toHaveCount(0)
  await expect(hq.getByText('Free Flight')).toBeVisible() // Training Grounds are in the same picker
})

test('the picker: mission first, a mission nobody can fly is dimmed with its rank, then the five pilots with exact gaps', async ({ page }) => {
  await openHq(page)
  const hq = hqOf(page)
  await newCampaign(page, 'Picker', 'U.S. Navy')
  await hq.getByRole('button', { name: /Choose a mission/ }).click()
  await expect(hq.getByText('Orders for the current chapter are not yet issued in this build.')).toBeVisible()
  await expect(hq.getByText(/No pilot of the five can fly this yet \(CDR\+\)/)).toHaveCount(2)
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).isDisabled()
  await hq.getByRole('radio', { name: /Catalina Water Qualification/ }).first().click()
  await hq.getByRole('button', { name: /Next: assign a pilot/ }).click()
  await expect(hq.getByText('Squadron Roster')).toBeVisible()
  await expect(hq.getByText('NEEDS LTJG (2,500 MORE POINTS)')).toHaveCount(5)
  await expect(hq.getByRole('button', { name: /^Assign / }).first()).toBeDisabled()
})
