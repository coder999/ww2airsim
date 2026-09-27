import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, waitForScenario, type DiagWindow } from './harness.js'

/**
 * Tier 2, friendly fire and dishonorable discharge (spec
 * 2026-09-26-friendly-fire-design.md §8), on the reference GPU. What only
 * this tier proves: the whole chain through the shipped DOM. The readout's
 * radio call, the debrief's red DISHONORABLE DISCHARGE stamp with a zero
 * score and no Continue, and the roster and Dossier both reading
 * DISCHARGED after Return to title. Tier 1 (tests/render/discharge.test.ts)
 * proves the same models headless; none of it can see `debrief.ts`'s
 * `show()` or the title's status chip, which exist only as DOM.
 *
 * `friendly-fire-range` puts the player 250 m behind an allied Hellcat on
 * the same heading, so Space hits it at once (Tier 1 pins "within 2 s").
 * A dive into San Pedro Bay then ends the flight at the impact debrief.
 */
test.setTimeout(240_000)

const PILOT = 'Discharge Pilot'
const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

test('friendly fire: the radio call, a discharged debrief with score 0, and DISCHARGED on the roster and Dossier', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // Booted by URL, not switched to from the title: an in-place switch keeps
  // the BOOT scenario's cloud layers (main.ts sets `cloudLayers` once, at
  // boot; pre-existing, found 2026-09-26), so free-flight's cumulus would
  // be drawn over this cloudless range and measured as its cost.
  await page.goto('/?scenario=friendly-fire-range')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()

  // -- The roster flow: a fresh pilot, the dev scenario from the picker.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill(PILOT)
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: 'Friendly Fire (dev)' }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()

  await waitForScenario(page, 'friendly-fire-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id).sort()), { timeout: 20_000 })
    .toEqual(['ally-1', 'bandit-1', 'f6f-1'])
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // -- Fire on the wingman until the sim records friendly fire.
  await page.keyboard.down('Space')
  await expect
    .poll(() => combat(page).then((c) => c.player.friendlyFire), { timeout: 20_000, message: 'no friendly fire recorded' })
    .not.toBeNull()
  await page.keyboard.up('Space')
  const ff = (await combat(page)).player.friendlyFire!
  expect(ff).toMatchObject({ kind: 'aircraft', target: 'ally-1' })
  const bandit = (await combat(page)).aircraft.find((a) => a.id === 'bandit-1')!
  expect(bandit.structure, 'the axis Hellcat was hit').toBe(1)

  // The radio call leads the readout for 5 s of sim time.
  const readout = page.locator('[aria-label="Combat"]')
  await expect(readout).toContainText("CEASE FIRE! YOU'RE HITTING FRIENDLIES!")
  await page.screenshot({ path: 'test-results/friendly-fire-warning.png' })
  // ...then a persistent tag.
  await expect(readout).toContainText('FRIENDLY FIRE', { timeout: 15_000 })
  await expect(readout).not.toContainText('CEASE FIRE', { timeout: 15_000 })

  // -- Dive into the sea: pitchDown is ArrowUp (src/input/bindings.ts).
  await page.keyboard.down('ArrowUp')
  await expect(debriefDialog(page)).toBeVisible({ timeout: 60_000 })
  await page.keyboard.up('ArrowUp')
  const debrief = debriefDialog(page)
  await expect(debrief).toContainText('DISHONORABLE DISCHARGE')
  await expect(debrief).toContainText('score 0')
  await expect(debrief).toContainText('forfeit (×0)')
  await expect(debrief).toContainText('Friendly fire')
  await expect(debrief.getByRole('button', { name: 'Continue' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/friendly-fire-debrief.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })

  // -- Return to title: the roster row and the Dossier read DISCHARGED.
  await debrief.getByRole('button', { name: 'Return to title' }).click()
  const reshown = page.getByRole('dialog', { name: 'Title' })
  await expect(reshown).toBeVisible()
  await expect(reshown.getByRole('button', { name: new RegExp(`${PILOT} — ENS — 0 — DISCHARGED`) })).toBeVisible()
  await expect(reshown.locator('.stamp-chip', { hasText: 'DISCHARGED' })).toBeVisible()
  await reshown.getByRole('button', { name: `Dossier: ${PILOT}` }).click()
  const dossier = page.getByRole('dialog', { name: `Dossier: ${PILOT}` })
  await expect(dossier).toContainText('Discharged')
  await expect(dossier).toContainText('Killed · Discharged')
  await page.screenshot({ path: 'test-results/friendly-fire-dossier.png' })

  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`friendly-fire: first hit tick ${ff.tick}; gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
