import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, startGame, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * Tier 2, Task 9 (2026-09-24-plan-ui-realism): the reference-GPU acceptance
 * for everything the plan's first 8 tasks built -- the Settings dialog
 * (Render Quality / Asset Quality / Damage Model, Tasks 1/5/6), the
 * naval-comms visual redesign of the roster and debrief screens (Tasks 4/7/8)
 * and the boot-sequence wiring that connects them (Task 6). Every case here
 * is read via a real screenshot before being trusted, per this repo's own
 * standing rule (README/CLAUDE.md): "never argue about a picture nobody
 * looked at."
 *
 * Two items are carried forward from earlier tasks' reviews specifically for
 * this task to close (task-9-brief.md's own dispatch text):
 *
 * 1. The DEV-override-wins claim (`?oceanTier=` beats a saved `low` setting)
 *    was previously pinned only by a source-text regex on `main.ts`
 *    (`bootQuality.test.ts`), never by a running check. See "DEV `?oceanTier=`
 *    override wins..." below, which uses the new `__ww2.qualityProbeChecked()`
 *    hook (`diagnostics.ts`/`main.ts`, added by this task) alongside the
 *    pre-existing `oceanTier()` hook.
 * 2. A screen that never calls `ensureStampFilter()` renders an invisible
 *    `.stamp` with no error anywhere (Task 5 review). "roster screen
 *    composites..." and "debrief screen composites..." below both assert a
 *    real, non-zero bounding box and a resolved `filter` on a live `.stamp`
 *    element, not just that the DOM node exists.
 *
 * Settings is reachable only from the title screen (its button lives in
 * `titleScreen.ts`'s always-visible row, hidden once "New game" dismisses the
 * overlay -- there is no in-flight reopening path), so every case that both
 * drives the dialog AND needs a live in-game effect does the dialog work
 * FIRST, then calls `startGame`. `waitForTerrain` itself calls `startGame`,
 * so it is deliberately NOT used before the dialog is done with here -- the
 * manual `groundHeightM()` wait below is the same signal without the
 * New-game side effect.
 */

const f6f = loadAircraftSpec('f6f-hellcat')
const [xName, yName, zName] = SPAWN_PARAMS
const RANGE = `/?${SCENARIO_PARAM}=gunnery-range&${xName}=0&${yName}=5000&${zName}=0`

test.setTimeout(120_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

/** Waits for the terrain heightfield without pressing "New game" -- unlike
 *  `harness.ts`'s `waitForTerrain`, which does both, because several cases
 *  here need the title screen (and its Settings button) still up afterward. */
async function waitForTerrainOnly(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
}

function settingsDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Settings' })
}

test('fresh profile: no Recommended tag until the probe window elapses, then one appears', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await waitForTerrainOnly(page)
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'Settings' }).click()
  const dlg = settingsDialog(page)
  await expect(dlg).toBeVisible()

  // Nothing persisted, so the probe has not resolved yet -- the pre-latch in
  // `main.ts` (`let qualityChecked = quality.probeSuppressed`) starts false.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(false)
  await expect(dlg.getByText('Recommended')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/settings-fresh-no-recommended.png' })

  // The probe resolves at ~180 GPU-timestamp samples; the reference desktop's
  // render loop runs continuously even while the title holds the simulation
  // (confirmed: `adaptOceanQuality()` is called every frame from the main
  // render loop, unconditionally). 15s is generous headroom over the ~3s this
  // measures on the reference GPU.
  await expect(dlg.getByText('Recommended')).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  await page.screenshot({ path: 'test-results/settings-fresh-recommended.png' })
})

test('an explicit Simple-row pick persists across a reload, with no second probe run', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await waitForTerrainOnly(page)
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'Settings' }).click()
  let dlg = settingsDialog(page)
  await expect(dlg).toBeVisible()

  // Pick Low before the probe has any chance to resolve -- proves the pick
  // itself, not a race with the probe, is what persists.
  await dlg.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio', { name: /Low\b/ }).click()
  const saved = await page.evaluate(() => window.localStorage.getItem('ww2airsim.quality.v1'))
  expect(JSON.parse(saved!)).toEqual({ ocean: 'low', scenery: 'low', clouds: 'low' })

  await page.reload()
  await waitForTerrainOnly(page)

  // `probeSuppressed` is read at construction from whatever was ALREADY saved
  // before this page load, so it is latched true from the very first read --
  // no waiting required, unlike the fresh-profile case above.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('low')

  const reshownTitle = page.getByRole('dialog', { name: 'Title' })
  await reshownTitle.getByRole('button', { name: 'Settings' }).click()
  dlg = settingsDialog(page)
  await expect(dlg).toBeVisible()
  await expect(
    dlg.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio', { name: /Low\b/ }),
  ).toHaveAttribute('aria-checked', 'true')

  // Wait past the ~3s the fresh-profile case measured for the probe to
  // resolve, and confirm the stamp still never appears -- the actual
  // behavioral claim, not just the flag's initial value.
  await page.waitForTimeout(6_000)
  await expect(dlg.getByText('Recommended')).toHaveCount(0)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('low')
  await page.screenshot({ path: 'test-results/settings-persisted-no-second-probe.png' })
})

test('DEV ?oceanTier= override wins over a saved low render-quality setting', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // Written before the app's own scripts run (addInitScript fires on every
  // navigation in this page, ahead of any page script), so `createBootQuality`
  // reads it as this session's ALREADY-saved choice, exactly as a returning
  // player's browser would have it.
  await page.addInitScript(() => {
    window.localStorage.setItem('ww2airsim.quality.v1', JSON.stringify({ ocean: 'low', scenery: 'low', clouds: 'low' }))
  })
  await page.goto('/?oceanTier=high')
  await waitForTerrainOnly(page)

  // The actual runtime state, not the source text: `oceanTier()` reads the
  // live cascade tier `applyOceanTier` built, and the DEV override must have
  // won over the saved `low` for it to read `high` here.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('high')
  // Bonus, since it is nearly free here: `?oceanTier=` also seeds scenery
  // (`forcedSceneryTier`, Task 6 fix round 1 -- the regression that made
  // trees vanish under a query override). No `sceneryTier()` hook exists, so
  // this is read back through the persisted settings' own `scenery` field
  // being left alone (the override bypasses the saved-settings apply path
  // entirely, `applySceneryTier`'s own early return) -- not itself a claim
  // about pixels, which the Advanced-override test below covers visually.
  const saved = await page.evaluate(() => window.localStorage.getItem('ww2airsim.quality.v1'))
  expect(JSON.parse(saved!)).toEqual({ ocean: 'low', scenery: 'low', clouds: 'low' })
})

test('Advanced Scenery override to Low changes only Scenery: Ocean and Clouds stay High', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  // Bare URL: the parked runway spawn near Tacloban, where trees are known to
  // be visible at High scenery (project-ww2airsim-low-tier-hides-trees).
  await page.goto('/')
  await waitForTerrainOnly(page)
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'Settings' }).click()
  const dlg = settingsDialog(page)
  await expect(dlg).toBeVisible()

  await dlg.getByRole('button', { name: /Advanced/ }).click()
  const oceanGroup = dlg.getByRole('radiogroup', { name: 'Ocean quality' })
  const sceneryGroup = dlg.getByRole('radiogroup', { name: 'Scenery quality' })
  const cloudsGroup = dlg.getByRole('radiogroup', { name: 'Clouds quality' })
  // Nothing persisted yet -- the first-visit default is uniform High on all
  // three (`defaultQualitySettings('high')`).
  await expect(oceanGroup.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true')
  await expect(cloudsGroup.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true')

  await sceneryGroup.getByRole('radio', { name: 'Low' }).click()

  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('ww2airsim.quality.v1')!))
  expect(saved).toEqual({ ocean: 'high', scenery: 'low', clouds: 'high' })
  // The Simple row must show no single selection once the three diverge.
  const simpleRadios = dlg.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio')
  await expect(simpleRadios).toHaveCount(3)
  expect(await simpleRadios.evaluateAll((els) => els.map((el) => el.getAttribute('aria-checked')))).toEqual([
    'false',
    'false',
    'false',
  ])
  // Ocean and Clouds' own live state -- read through the app's real diagnostic
  // hooks, not inferred from the saved JSON alone.
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('high')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().tier)).toBe('high')

  await dlg.getByRole('button', { name: 'Close' }).click()
  await startGame(page)
  // Let the scene settle visually (vegetation recompose is not instantaneous,
  // and the airfield/town props this spawn sits among stream in over the
  // same window) before the screenshot that is the actual proof scenery
  // moved. Same wait as the baseline test below, for a fair comparison.
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: 'test-results/scenery-override-low-no-trees.png' })

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('high')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().tier)).toBe('high')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('baseline at default (all High): the same spawn with trees, for comparison against the Scenery-override screenshot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  // Wait for terrain BEFORE "New game", matching the Scenery-override test's
  // own sequencing -- skipping this (an earlier version of this test did)
  // screenshots the world mid-settle: the parked airplane still at its
  // pre-terrain placeholder altitude, floating over undressed ground with
  // none of `createAirfield`/`createTowns`/`createVegetation`'s props
  // streamed in yet, which looks like a completely different, treeless
  // location and is not a fair comparison against the override screenshot.
  await waitForTerrainOnly(page)
  await startGame(page) // no Settings interaction: default uniform High
  await page.waitForTimeout(6_000)
  await page.screenshot({ path: 'test-results/scenery-baseline-high-with-trees.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('Damage Model Arcade: a hard-G/overspeed maneuver does not destroy the airframe, and the stress reading still moves', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrainOnly(page)
  const title = page.getByRole('dialog', { name: 'Title' })
  await title.getByRole('button', { name: 'Settings' }).click()
  const dlg = settingsDialog(page)
  await expect(dlg).toBeVisible()
  await dlg.getByRole('radiogroup', { name: 'Damage model' }).getByRole('radio', { name: /Arcade\b/ }).click()
  expect(await page.evaluate(() => window.localStorage.getItem('ww2airsim.damageModel.v1'))).toBe('arcade')
  await dlg.getByRole('button', { name: 'Close' }).click()
  await startGame(page)

  // Same production dive-and-pull-out `structural-overload.spec.ts` (Realistic)
  // exercises, so the two are a real apples-to-apples comparison run in the
  // same Tier 2 session.
  await page.keyboard.down('Equal')
  await page.waitForTimeout(3_500)
  await page.keyboard.up('Equal')
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const initial = await combat(page)
  expect(initial.player.structure).toBe(1)

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1_500)
  await page.keyboard.up('ArrowUp')
  await expect.poll(() => combat(page).then((c) => c.player.stress.overspeed), { timeout: 30_000 }).toBe(true)
  const afterDive = await combat(page)
  expect(afterDive.player.stress.peakAirspeedMps).toBeGreaterThan(f6f.limits.diveSpeedMps)
  await expect(page.getByLabel('Combat', { exact: true })).toContainText('OVERSPEED')

  await page.keyboard.down('ArrowDown')
  await expect.poll(() => combat(page).then((c) => c.player.stress.overG), { timeout: 15_000 }).toBe(true)
  // The HUD text and the screenshot both happen here, HELD, matching exactly
  // the moment `structural-overload.spec.ts` reads `OVER-G`/screenshots its
  // own dive -- `overG`/`overspeed` (unlike the peak fields below) are
  // CURRENT-frame booleans (`loadFactorG > limits.gLimit` this instant,
  // `src/sim/damage/overload.ts`), which clear again within a second of
  // releasing the stick as G and speed bleed off. Asserting them again after
  // release, as an earlier version of this test did, is not a real claim --
  // it fails on a healthy, correctly-behaving Arcade flight exactly as
  // readily as on a damaged one.
  await expect(page.getByLabel('Combat', { exact: true })).toContainText('OVER-G')
  await expect(page.getByLabel('Combat', { exact: true })).toContainText('OVERSPEED')
  const heldReadout = await combat(page)
  console.log(`damage model arcade (held): stress ${JSON.stringify(heldReadout.player.stress)}, HP ${heldReadout.player.structure}`)
  await page.screenshot({ path: 'test-results/damage-model-arcade-held.png' })
  // A short further hold, not `structural-overload.spec.ts`'s much longer
  // sustained pull (which needs to complete a real loop to destroy the
  // airframe under Realistic) -- that much stick held this long risks
  // completing a full loop and diving back into the sea, which is a real
  // crash unrelated to what this test is proving.
  await page.waitForTimeout(600)
  await page.keyboard.up('ArrowDown')
  await page.waitForTimeout(400)

  const impactAfterHold = await page.evaluate(() => (window as DiagWindow).__ww2!.impact())
  expect(impactAfterHold, `unexpected impact after the hold: ${JSON.stringify(impactAfterHold)}`).toBeNull()
  const afterHold = await combat(page)
  // The claim under test: the airframe survives an overstress that would
  // destroy it under Realistic (see structural-overload.spec.ts's own dive,
  // run in this same Tier 2 session for a direct comparison) -- structure
  // never left 1, even though the PEAK fields (monotonic, unlike the
  // instantaneous booleans above) prove the overstress genuinely happened
  // and was not just missed.
  expect(afterHold.player.structure).toBe(1)
  expect(afterHold.player.stress.peakLoadFactorG).toBeGreaterThan(f6f.limits.gLimit)
  expect(afterHold.player.stress.peakAirspeedMps).toBeGreaterThan(f6f.limits.diveSpeedMps)
  console.log(`damage model arcade (after release): stress ${JSON.stringify(afterHold.player.stress)}, HP ${afterHold.player.structure}`)

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`damage model arcade: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})

test('roster screen composites its letterhead/stamp/table over the WebGPU canvas, and the stamp actually renders', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await waitForTerrainOnly(page)
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Composite Check Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await expect(title.getByRole('button', { name: /Composite Check Pilot/ })).toBeVisible()

  // `:visible`, not a bare class selector: the title overlay also contains
  // the Settings dialog's own hidden `.letterhead`/`.sheet` (built once,
  // regardless of whether it has ever been opened -- `titleScreen.ts`'s
  // `build()` always calls `createSettingsDialog`), so a bare `.locator`
  // here is a strict-mode violation the first time this runs, not a rare one.
  await expect(title.locator('.letterhead:visible')).toBeVisible()
  await expect(title.locator('.form-table:visible')).toBeVisible()
  const stamp = title.locator('.stamp:visible', { hasText: 'Confidential' })
  await expect(stamp).toBeVisible()

  // Item 2's real check: a non-zero rendered box, not just DOM presence.
  const box = await stamp.boundingBox()
  expect(box, 'the Confidential stamp has no bounding box at all').not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)
  // And a RESOLVED filter -- an unresolved `filter: url(#missing)` computes to
  // an empty string per the Filter Effects spec, which is exactly the Task 5
  // review's invisible-stamp failure mode. The inline style is empty: the
  // filter must come from the stylesheet, not a per-element override hack.
  const filterInfo = await stamp.evaluate((el) => ({
    inline: (el as HTMLElement).style.filter,
    computed: getComputedStyle(el).filter,
  }))
  expect(filterInfo.inline).toBe('')
  expect(filterInfo.computed).toContain('stampRough')

  await page.screenshot({ path: 'test-results/roster-composite.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('debrief screen composites its letterhead/stamp/figures over the WebGPU canvas after a destruction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrainOnly(page)
  await startGame(page) // Realistic (default): this flight is meant to destroy the airframe.

  // Same maneuver as structural-overload.spec.ts, sustained through to zero
  // structure -- the quickest reliable path to a debrief this suite has.
  await page.keyboard.down('Equal')
  await page.waitForTimeout(3_500)
  await page.keyboard.up('Equal')
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1_500)
  await page.keyboard.up('ArrowUp')
  await expect.poll(() => combat(page).then((c) => c.player.stress.overspeed), { timeout: 30_000 }).toBe(true)
  await page.keyboard.down('ArrowDown')
  await debriefDialog(page).waitFor({ timeout: 45_000 })
  await page.keyboard.up('ArrowDown')

  const debrief = debriefDialog(page)
  await expect(debrief.locator('.letterhead')).toBeVisible()
  await expect(debrief.locator('.routing')).toBeVisible()
  await expect(debrief.locator('.form-table')).toBeVisible()

  const stamp = debrief.locator('.stamp').first()
  await expect(stamp).toBeVisible()
  const box = await stamp.boundingBox()
  expect(box, 'the outcome stamp has no bounding box at all').not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)
  const filterInfo = await stamp.evaluate((el) => ({
    inline: (el as HTMLElement).style.filter,
    computed: getComputedStyle(el).filter,
  }))
  expect(filterInfo.inline).toBe('')
  expect(filterInfo.computed).toContain('stampRough')

  await page.screenshot({ path: 'test-results/debrief-composite.png' })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
