import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seaStateFor } from '../../src/render/ocean/weather.js'
import { CLOUDINESS_OPTIONS } from '../../src/render/cloudiness.js'
import { TACLOBAN_LAT_DEG, nearestTakeoffTime, takeoffHours } from '../../src/render/sky/sun.js'
import { debriefDialog, exactBallotLabel, spawnUrl, startGame, toConditions, waitForScenario, type DiagWindow } from './harness.js'

/**
 * E2E, the scenario picker (Headquarters' Training Grounds and Single Missions rows, then the launch memos; plan F5B). Plan 9 Task 7: picking a
 * scenario no longer navigates to `?scenario=<id>` and reloads -- it swaps
 * the entity list in place, via `main.ts`'s `loadScenario`. What only a
 * browser can prove is that this stays true end to end: the URL never
 * changes, the title hides immediately (there is no reload to wait out),
 * and the world that comes up carries the REAL, different entity list the
 * picked scenario declares -- not just a relabelled default and not the
 * previous scenario's meshes left over.
 */
test.setTimeout(120_000)

test('a direct Flattop Hunt URL boots its racks-only Avenger with a legal loadout', async ({ page }) => {
  // Regression: boot used the global Both default before Form 4 could apply
  // this mission's Bombs/Torpedo recommendation. The Avenger has racks but no
  // rails, so validation replaced the title with a bad-content failure.
  await page.goto('/?scenario=flattop-hunt')
  await waitForScenario(page, 'flattop-hunt')
  const title = await toConditions(page, { scenario: 'Flattop Hunt' })
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await expect(title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: 'Torpedo' })).toBeChecked()
})

test('picking a different scenario swaps entities and its cockpit in place, with no navigation', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const urlBefore = page.url()
  const title = await toConditions(page, { scenario: 'Flattop Hunt' })
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()

  // No reload: the title hides immediately and the URL never carries `?scenario=`.
  await expect(title).toBeHidden()
  // Wait for the renderer's live bundle identity via `waitForScenario`, not a `groundHeightM()` poll.
  await waitForScenario(page, 'flattop-hunt')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  // The real, different entity list flattop-hunt.json carries -- not free-flight's f6f-2 wingman.
  await expect.poll(
    () => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id).sort()),
    { timeout: 30_000 },
  ).toEqual(['avenger-1', 'avenger-2', 'avenger-3', 'avenger-4'])

  // Regression, 2026-10-12: the panel was constructed once from Free Flight's Hellcat and never rebuilt by the
  // in-page scenario switch. Read the production panel family's live diagnostic rather than a screenshot.
  await page.keyboard.down('KeyC')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyC')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())).toBe('cockpit')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cockpitLayout())).toBe('american-bomber')

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  await page.screenshot({ path: 'test-results/scenario-picker.png' })
})

test('picking the already-loaded scenario also stays in place (the same code path, scenarioId === requestedScenarioId)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const urlBefore = page.url()
  const title = await toConditions(page, { scenario: 'Free Flight' })

  // Free Flight is the production default scenario: this launch takes the same-scenario branch.
  const selectedCloudiness = CLOUDINESS_OPTIONS.find((option) => option.value === 'cloudy')!
  await title.getByRole('radiogroup', { name: 'Cloudiness' })
    .getByRole('radio', { name: exactBallotLabel(selectedCloudiness.label) }).check()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  await waitForScenario(page, 'free-flight')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'f6f-2'])
  const coverage = await page.evaluate(() => 1 - (window as DiagWindow).__ww2!.clouds().layers
    .filter((layer) => layer.kind === 'cumulus').reduce((clear, layer) => clear * (1 - layer.coverage), 1))
  expect(coverage).toBeCloseTo(selectedCloudiness.coverage, 5)
})

test('returning to Headquarters after an in-place scenario switch leaves a working front door', async ({ page }) => {
  // Replaces the old "return to title preselects the scenario actually loaded" regression: Headquarters picks its
  // scenario explicitly now, so what must hold is the round trip itself -- dive, debrief, Return to Headquarters,
  // and a second launch of a different scenario.
  //
  // `spawnUrl({x:0,y:120,z:0})` is a DEV override on the URL which `main.ts`'s `loadScenario` re-applies on EVERY
  // call, so the airplane starts 120 m over open water whichever scenario this test switches to, letting it reuse
  // `contact.spec.ts`'s steep-dive-into-the-sea trick to reach a debrief quickly.
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  const first = await toConditions(page, { scenario: 'Gunnery Range' })
  await first.getByRole('button', { name: 'Next' }).click()
  await first.getByRole('button', { name: 'Next' }).click()
  await first.getByRole('button', { name: 'Launch' }).click()
  await expect(first).toBeHidden()
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await page.keyboard.up('ArrowUp')
  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(page.getByRole('dialog', { name: 'Headquarters' }).getByText('Air Group Headquarters')).toBeVisible()

  const second = await toConditions(page, { scenario: 'Free Flight' })
  await second.getByRole('button', { name: 'Next' }).click()
  await second.getByRole('button', { name: 'Next' }).click()
  await second.getByRole('button', { name: 'Launch' }).click()
  await waitForScenario(page, 'free-flight')
})

/**
 * A2 plus Form 2 cloudiness: a title launch takes its hour and sea state from
 * the selected scenario, while the player's cloudiness selection overrides
 * that scenario's cumulus coverage. Both switch directions are enrolled
 * because their code paths differ, including adding a deck to historically
 * clear weather.
 */
type WeatherJson = { timeOfDay: number; clouds?: unknown[]; windMps: number }
const weatherOf = (id: string): WeatherJson =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/scenarios/${id}.json`, import.meta.url)), 'utf8')) as { weather: WeatherJson }).weather

const SWITCHES = [
  { boot: '/', from: 'free-flight', to: 'gunnery-range', label: 'Gunnery Range', cloudiness: 'Clear' },
  { boot: '/?scenario=gunnery-range', from: 'gunnery-range', to: 'airfield-strike', label: 'Airfield Strike', cloudiness: 'Overcast' },
] as const

for (const s of SWITCHES) {
  test(`a title launch from ${s.from} to ${s.to} applies scenario conditions and ${s.cloudiness} clouds`, async ({ page }) => {
    const from = weatherOf(s.from)
    const to = weatherOf(s.to)
    // Not vacuous: each pair differs in hour and in whether there is a deck,
    // and the second also in sea state, or the switch could pass by doing nothing.
    expect(from.timeOfDay).not.toBe(to.timeOfDay)
    expect((from.clouds ?? []).length > 0).not.toBe((to.clouds ?? []).length > 0)
    if (s.to === 'airfield-strike') expect(seaStateFor(from.windMps, undefined)).not.toBe(seaStateFor(to.windMps, undefined))

    await page.goto(s.boot)
    await waitForScenario(page, s.from)
    const diag = (): Promise<{ hour: number; layers: number; cumulusCoverage: number; composited: boolean; sea: number }> => page.evaluate(() => {
      const w = (window as DiagWindow).__ww2!
      const layers = w.clouds().layers
      const cumulusCoverage = 1 - layers.filter((layer) => layer.kind === 'cumulus')
        .reduce((clear, layer) => clear * (1 - layer.coverage), 1)
      return { hour: w.sun().timeOfDay, layers: layers.length, cumulusCoverage, composited: w.clouds().composited, sea: w.seaState() }
    })
    await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
    const before = await diag()
    expect(before.layers).toBe((from.clouds ?? []).length)
    expect(before.composited).toBe(before.layers > 0)

    await startGame(page, { scenario: s.label, cloudiness: s.cloudiness })
    await waitForScenario(page, s.to)
    // A title launch flies the takeoff time A3 preselects (94866345): the Morning,
    // Midday or Dusk nearest the scenario's own hour, so airfield-strike's 0730 flies at 0740.
    const takeoff = takeoffHours(TACLOBAN_LAT_DEG)
    const hour = takeoff[nearestTakeoffTime(to.timeOfDay, takeoff)]
    // scenarioId can lead the switch's last step; wait for the hour, which is applied with the rest of the weather.
    await page.waitForFunction((h) => { const t = (window as DiagWindow).__ww2!.sun().timeOfDay; return t >= h && t < h + 0.1 }, hour, { timeout: 30_000 }).catch(() => undefined)
    const after = await diag()
    // The sun creeps with the sim clock: a few seconds of flight is well under 0.1 h.
    expect(after.hour).toBeGreaterThanOrEqual(hour)
    expect(after.hour).toBeLessThan(hour + 0.1)
    const cloudiness = CLOUDINESS_OPTIONS.find((option) => option.label === s.cloudiness)!
    expect(after.layers).toBeGreaterThan(0)
    expect(after.cumulusCoverage).toBeCloseTo(cloudiness.coverage, 5)
    expect(after.composited).toBe(true)
    expect(after.sea).toBe(seaStateFor(to.windMps, undefined))
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  })
}
