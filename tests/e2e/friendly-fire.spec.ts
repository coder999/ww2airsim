import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, diveToSea, percentile, startGame, waitForScenario, type DiagWindow, recordFrameTime } from './harness.js'
import { flyPass } from './pilot.js'
import { groundTruthTerrain, rangePass } from '../pilot/rangePass.js'

/**
 * E2E, friendly fire (spec 2026-09-26-friendly-fire-design.md §8), on the
 * reference GPU. What only this tier proves: the whole chain through the
 * shipped DOM -- the radio line's call, the debrief's stamp and forfeit
 * line with no Continue, and Return to Headquarters. Deterministic (tests/render/discharge.test.ts) proves the same models
 * headless; none of it can see `debrief.ts`'s `show()` or the title's chip.
 *
 * F5A (2026-10-14): nonfatal friendly damage is a warning only (the radio call and the
 * FRIENDLY FIRE tag); the sortie is forfeit and the pilot discharged only when a friendly is
 * DESTROYED (`friendlyKills`), which both endings below arrange.
 *
 * Two endings, because the dead cannot be discharged (Mark, 2026-09-26,
 * ruling FF-7 amended):
 * - `friendly-fire-range`: fire on the allied wingman 250 m ahead, then dive
 *   into San Pedro Bay. KILLED, the sortie forfeit, the pilot K.I.A.
 * - `friendly-fire-field`: parked on Tacloban's runway, fire on the parked
 *   allied Hellcat ahead, then hop and land. DISHONORABLE DISCHARGE.
 *
 * Both boot by URL, not by switching from the title: an in-place switch
 * keeps the BOOT scenario's clouds (docs/clouds.md open issue 10), which
 * would be measured as this scenario's cost.
 */
test.setTimeout(240_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

/** Headquarters, a campaign, and the URL's Dev test bed through the real screens. The friendly-fire beds are Dev-only
 *  (sortie spec A1) and so UNSCORED: they never bank into the campaign (plan F5B), which is why the K.I.A. and
 *  discharge CLOSURES are proven by `tests/render/campaignBank.test.ts` and the discharge model tests, and this spec
 *  proves the chain through the shipped DOM up to the debrief. */
async function launch(page: Page, scenario: string, label: string): Promise<void> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`/?scenario=${scenario}`)
  await startGame(page, { scenario: label, dev: true })
  await waitForScenario(page, scenario)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
}

/** Holds Space until the sim records friendly fire, and returns it. */
async function fireUntilFriendlyFire(page: Page, timeout: number, release = true) {
  await page.keyboard.down('Space')
  await expect
    .poll(() => combat(page).then((c) => c.player.friendlyFire), { timeout, message: 'no friendly fire recorded' })
    .not.toBeNull()
  if (release) await page.keyboard.up('Space')
  return (await combat(page)).player.friendlyFire!
}

async function liveChecks(page: Page, what: string): Promise<void> {
  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`friendly-fire (${what}): gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  recordFrameTime(p95)
}

test('friendly fire, then death: the radio call, KILLED with the sortie forfeit, and K.I.A. -- not discharged', async ({ page }) => {
  await launch(page, 'friendly-fire-range', 'Friendly Fire (dev)')
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id).sort()), { timeout: 20_000 })
    .toEqual(['ally-1', 'bandit-1', 'f6f-1'])
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // Keep the trigger down (F5A): the first hit damages the ally's pitch control and it pulls out of the
  // line, so a released trigger cannot be picked up again by a script that does not aim.
  const ff = await fireUntilFriendlyFire(page, 20_000, false)
  expect(ff).toMatchObject({ kind: 'aircraft', target: 'ally-1' })
  const bandit = (await combat(page)).aircraft.find((a) => a.id === 'bandit-1')!
  expect(bandit.structure, 'the axis Hellcat was hit').toBe(1)

  // The radio call plays on M2's radio line; the readout carries only the
  // persistent tag (friendly-fire note for M2, §2-3).
  await expect(page.getByRole('status', { name: 'Radio' })).toHaveText("Cease fire! Cease fire! You're hitting friendlies!", { timeout: 10_000 })
  const readout = page.locator('[aria-label="Combat"]')
  await expect(readout).toContainText('FRIENDLY FIRE')
  await expect(readout).not.toContainText('CEASE FIRE')
  await page.screenshot({ path: 'test-results/friendly-fire-warning.png' })
  // The call clears after RADIO_SHOW_MS (5 s).
  await expect(page.getByRole('status', { name: 'Radio' })).toBeHidden({ timeout: 15_000 })

  // F5A (2026-10-14): that was only a warning. The pilot is judged on a friendly DESTROYED, so finish the
  // ally: hold Space until it is burning or down, then wait for its destruction to be credited
  // (a burning airplane explodes or crashes a few seconds later).
  await expect
    .poll(() => combat(page).then((c) => { const ally = c.aircraft.find((a) => a.id === 'ally-1')!; return ally.burning || ally.destroyed }), { timeout: 60_000, message: 'the ally was never put out of the fight' })
    .toBe(true)
  await page.keyboard.up('Space')
  await expect
    .poll(() => combat(page).then((c) => c.aircraft.find((a) => a.id === 'f6f-1')!.friendlyKills), { timeout: 60_000, message: 'the ally never went down' })
    .toBeGreaterThan(0)

  // -- Into San Pedro Bay. `diveToSea` holds the nose down only while the sink
  // is shallow: this spec used to hold it throughout, which flies an outside
  // loop. Measured on the reference GPU after the sortie-forms merge
  // (2026-09-27): from 783 m it bottomed at 99 m and climbed back to 690 m, three
  // runs of three, never reaching the sea (earlier notes called it a phugoid).
  await diveToSea(page)
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('KILLED')
  await expect(debrief).not.toContainText('DISHONORABLE DISCHARGE')
  await expect(debrief).toContainText('score 0')
  await expect(debrief).toContainText('KILLED — forfeit (×0)')
  await expect(debrief).toContainText('Friendly fire')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/friendly-fire-killed.png' })
  await liveChecks(page, 'range, killed')

  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(page.getByRole('dialog', { name: 'Headquarters' }).getByText('Air Group Headquarters')).toBeVisible()
  // A Dev test bed is unscored: the campaign has no sortie and no loss.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign())).toMatchObject({ pending: null, archived: 0 })
})

test('friendly fire, then a landing: DISHONORABLE DISCHARGE with score 0', async ({ page }) => {
  await launch(page, 'friendly-fire-field', 'Friendly Fire: Field (dev)')
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // The range's strafing pass onto the parked ally, then the landing straight
  // ahead (a run-in since 2026-09-29: from T1's tail-down parked attitude the
  // guns fire over it).
  expect((await flyPass(page, rangePass('friendly-fire-field', 'ally-1', groundTruthTerrain()))).end, 'the pass did not end at rest on the runway').toBe('stopped')
  expect((await combat(page)).player.friendlyFire, 'no friendly fire recorded').toMatchObject({ kind: 'aircraft', target: 'ally-1' })
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('DISHONORABLE DISCHARGE')
  await expect(debrief).toContainText('score 0')
  await expect(debrief).toContainText('LANDED — forfeit (×0)')
  await expect(debrief).toContainText('Friendly fire')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/friendly-fire-debrief.png' })
  await liveChecks(page, 'field, landed')

  await debrief.getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(page.getByRole('dialog', { name: 'Headquarters' }).getByText('Air Group Headquarters')).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign())).toMatchObject({ pending: null, archived: 0 })
})
