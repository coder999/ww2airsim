import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, hopAndLand, percentile, waitForScenario, type DiagWindow, launchFromOrders } from './harness.js'

/**
 * Tier 2, friendly fire (spec 2026-09-26-friendly-fire-design.md §8), on the
 * reference GPU. What only this tier proves: the whole chain through the
 * shipped DOM -- the radio line's call, the debrief's stamp and forfeit
 * line with no Continue, and the roster row, chip and Dossier after Return
 * to title. Tier 1 (tests/render/discharge.test.ts) proves the same models
 * headless; none of it can see `debrief.ts`'s `show()` or the title's chip.
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

/** The roster flow for a fresh pilot, into the URL's scenario. */
async function launch(page: Page, scenario: string, label: string, pilot: string): Promise<void> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // The friendly-fire ranges are Dev-only test beds (sortie spec A1): `?scenario=`
  // checks Dev (A2), and `recordDevSorties` (SF-R6) keeps the K.I.A. and
  // DISCHARGED this spec proves on the roster and Dossier.
  await page.goto(`/?scenario=${scenario}&recordDevSorties`)
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill(pilot)
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: label }).check()
  await launchFromOrders(title)
  await expect(title).toBeHidden()
  await waitForScenario(page, scenario)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
}

/** Holds Space until the sim records friendly fire, and returns it. */
async function fireUntilFriendlyFire(page: Page, timeout: number) {
  await page.keyboard.down('Space')
  await expect
    .poll(() => combat(page).then((c) => c.player.friendlyFire), { timeout, message: 'no friendly fire recorded' })
    .not.toBeNull()
  await page.keyboard.up('Space')
  return (await combat(page)).player.friendlyFire!
}

async function budget(page: Page, what: string): Promise<void> {
  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`friendly-fire (${what}): gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
}

test('friendly fire, then death: the radio call, KILLED with the sortie forfeit, and K.I.A. -- not discharged', async ({ page }) => {
  const PILOT = 'Forfeit Pilot'
  await launch(page, 'friendly-fire-range', 'Friendly Fire (dev)', PILOT)
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id).sort()), { timeout: 20_000 })
    .toEqual(['ally-1', 'bandit-1', 'f6f-1'])
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const ff = await fireUntilFriendlyFire(page, 20_000)
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
  // The call clears after RADIO_SHOW_MS (5 s). The wait is also load-bearing:
  // the dive below was measured starting ~5 s after the hit (when the
  // readout's old transient call cleared), and started at once it bottoms
  // out in a phugoid 70-140 m above the sea instead of going in (probe on
  // the reference GPU, 2026-09-27, identical on main).
  await expect(page.getByRole('status', { name: 'Radio' })).toBeHidden({ timeout: 15_000 })

  // -- Dive into the sea: pitchDown is ArrowUp (src/input/bindings.ts).
  await page.keyboard.down('ArrowUp')
  await expect(debriefDialog(page)).toBeVisible({ timeout: 60_000 })
  await page.keyboard.up('ArrowUp')
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('KILLED')
  await expect(debrief).not.toContainText('DISHONORABLE DISCHARGE')
  await expect(debrief).toContainText('score 0')
  await expect(debrief).toContainText('KILLED — forfeit (×0)')
  await expect(debrief).toContainText('Friendly fire')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/friendly-fire-killed.png' })
  await budget(page, 'range, killed')

  await debrief.getByRole('button', { name: 'Return to title' }).click()
  const reshown = page.getByRole('dialog', { name: 'Title' })
  await expect(reshown).toBeVisible()
  await expect(reshown.getByRole('button', { name: new RegExp(`${PILOT} — ENS — 0 — KIA`) })).toBeVisible()
  await reshown.getByRole('button', { name: `Dossier: ${PILOT}` }).click()
  const dossier = page.getByRole('dialog', { name: `Dossier: ${PILOT}` })
  await expect(dossier).toContainText('K.I.A.')
  await expect(dossier).not.toContainText('Discharged')
})

test('friendly fire, then a landing: DISHONORABLE DISCHARGE with score 0, and DISCHARGED on the roster and Dossier', async ({ page }) => {
  const PILOT = 'Discharge Pilot'
  await launch(page, 'friendly-fire-field', 'Friendly Fire: Field (dev)', PILOT)
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 })
    .toBe(true)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const ff = await fireUntilFriendlyFire(page, 30_000)
  expect(ff).toMatchObject({ kind: 'aircraft', target: 'ally-1' })

  await hopAndLand(page)
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('DISHONORABLE DISCHARGE')
  await expect(debrief).toContainText('score 0')
  await expect(debrief).toContainText('LANDED — forfeit (×0)')
  await expect(debrief).toContainText('Friendly fire')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/friendly-fire-debrief.png' })
  await budget(page, 'field, landed')

  await debrief.getByRole('button', { name: 'Return to title' }).click()
  const reshown = page.getByRole('dialog', { name: 'Title' })
  await expect(reshown).toBeVisible()
  await expect(reshown.getByRole('button', { name: new RegExp(`${PILOT} — ENS — 0 — DISCHARGED`) })).toBeVisible()
  await expect(reshown.locator('.stamp-chip', { hasText: 'DISCHARGED' })).toBeVisible()
  await reshown.getByRole('button', { name: `Dossier: ${PILOT}` }).click()
  const dossier = page.getByRole('dialog', { name: `Dossier: ${PILOT}` })
  await expect(dossier).toContainText('Discharged')
  await expect(dossier).toContainText('Field landing · Discharged')
  await page.screenshot({ path: 'test-results/friendly-fire-dossier.png' })
})
