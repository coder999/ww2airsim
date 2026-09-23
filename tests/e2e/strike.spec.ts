import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, startGame, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM, SPAWN_PARAMS } from '../../src/render/spawn.js'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { localToWorld } from '../../src/sim/world/airfields.js'
import type { Loadout } from '../../src/sim/weapons/stores.js'

/**
 * Tier 2, the strike slice (Plan 6b). Same platform and caveats as
 * `gunnery.spec.ts`: the reference GPU on the Windows desktop, never hosted
 * CI. Run it with the README's Tier 2 command.
 *
 * What only this tier can prove is the whole strike slice wired together in
 * the shipped app: the title screen's loadout picker actually reaching
 * `worldFromScenario`'s `loadout` argument, `V`/`E` reaching
 * `Controls.dropBomb`/`fireRockets` through the real keydown listener, a
 * released bomb or rocket flying the production `flyProjectile` closed form
 * over real terrain against a real anchored ship or airfield building,
 * detonating on nearest contact, and the resulting hull/structure damage
 * reaching `World.combat` where `ships()`/`structures()`
 * (src/render/diagnostics.ts) can see it -- along with the fireball, smoke
 * and collapse visuals no Tier 1 test can reach at all. Every piece below is
 * unit-tested in isolation (tests/sim/strike.test.ts); the defect class
 * this tier exists to catch is a feature inert in the browser with its
 * tests green.
 *
 * **Not run as part of this commit.** Task 11 (2026-09-22) wrote this file
 * against the harness conventions `gunnery.spec.ts` and `contact.spec.ts`
 * already establish, but ryzen (the reference GPU desktop) had no
 * interactive session for `playwright run-server` to attach to during this
 * pass, so nothing below has executed even once -- not one screenshot has
 * been looked at, not one number here is measured. See
 * `docs/handoff/2026-09-22-plan6b-strike.md` for the exact commands to run
 * it, and read every screenshot with the Read tool before believing any of
 * this passed.
 *
 * **Known accuracy risk, flagged rather than hidden.** The maru's hull is
 * only +-7.9 m wide (`content/ships/type-b-maru.json`'s 15.8 m beam) astride
 * the bombing run's own line of flight (east, the ship's SHORT axis --
 * heading 0 means its 112 m length runs north-south). `tests/sim/
 * strike.test.ts`'s "flies a bomb on the round closed form" case proves a
 * bomb's fall is fully deterministic once released (no dispersion applied,
 * unlike guns/rockets), so the one real source of miss risk here is release
 * TIMING: `page.waitForFunction` below triggers on the live simulated
 * position rather than a fixed delay specifically to keep that error small
 * (Chromium's rAF-driven poll, not `expect.poll`'s coarser ~100 ms default),
 * but a real run over a real network tunnel may still miss the 7.9 m window.
 * If it does, retune `BOMB_LEVEL_RANGE_M`'s spawn offset or the release
 * trigger before assuming the strike code itself is broken.
 */
const RANGE = `/?${SCENARIO_PARAM}=strike-range`
const [xName, yName, zName] = SPAWN_PARAMS

const bundle = loadScenarioBundle('strike-range')
const dulag = bundle.airfields['dulag']!
const [maruX, maruZ] = bundle.scenario.ships[0]!.waypoints[0]!
const hangar1 = dulag.buildings.find((b) => b.id === 'dulag-hangar-1')!
const hangar1World = localToWorld(dulag, hangar1.x, hangar1.z)

/**
 * `flyProjectile`'s own closed form, measured by `tests/sim/strike.test.ts`
 * ("lands a 1,500 m release at the range and speed the shipped drag
 * actually gives", 2026-09-22): an `an-m65` released level at 120 m/s from
 * 1,500 m lands 2,066.5 m downrange after 17.67 s of fall, at 202.9 m/s.
 * That figure is real -- backed by an actual Tier 1 run -- unlike anything
 * else about this bombing run's geometry, which is reasoning about code
 * this session could not execute. The run below is built to reproduce that
 * exact geometry (level release, spawn's default airborne attitude) rather
 * than guess what a diving release's trajectory would be, since there is no
 * equivalent measurement for one.
 */
const BOMB_LEVEL_RANGE_M = 2066.5
const BOMB_FALL_S = 17.67

test.setTimeout(180_000)

const spawnQuery = (x: number, y: number, z: number): string =>
  `${RANGE}&${xName}=${x}&${yName}=${y}&${zName}=${z}`

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const ships = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.ships())
const structures = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.structures())
const validationErrors = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)

const assertNoValidationErrors = async (page: Page): Promise<void> => {
  const errors = await validationErrors(page)
  expect(errors, `WebGPU validation errors:\n${JSON.stringify(errors, null, 2)}`).toEqual([])
}

/**
 * Waits for terrain, picks `loadout` on the title screen's own radio row
 * (spec §1: "clean, bombs, rockets, both"), then presses New game --
 * `LOADOUT_OPTIONS`' labels (src/render/titleScreen.ts) capitalize the
 * `Loadout` value, so `'both'` -> `'Both'`. Deliberately does NOT reuse
 * `harness.ts`'s `waitForTerrain` (which only presses New game): every test
 * in this file needs the picker itself exercised, not its default agreeing
 * with what the scenario happens to want.
 */
async function startWithLoadout(page: Page, loadout: Loadout): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  const label = loadout[0]!.toUpperCase() + loadout.slice(1)
  await page.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: label }).check()
  await startGame(page)
  // One frame's grace so `World.combat` exists before the first read below.
  await page.waitForTimeout(200)
}

test('strike range: Both carries stores into combat, visible under the wings in both camera modes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await startWithLoadout(page, 'both')

  const c = await combat(page)
  expect(c.player.stores).toEqual({ bombs: 2, rockets: 6 })

  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/strike-stores-chase.png' })

  await page.keyboard.press('KeyC')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())).toBe('cockpit')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/strike-stores-cockpit.png' })
  await page.keyboard.press('KeyC')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())).toBe('chase')

  await assertNoValidationErrors(page)
})

test('a level 1,500 m release lands a bomb on the anchored maru, and holding V through a pause does nothing', async ({
  page,
}) => {
  const releaseX = maruX - BOMB_LEVEL_RANGE_M
  // 400 m of runway upstream of the calibrated release point: enough for the
  // title screen click and this function's own overhead to be well behind
  // us before the release trigger below starts watching the live position.
  const spawnX = releaseX - 400

  await page.goto(spawnQuery(spawnX, 1500, maruZ))
  await startWithLoadout(page, 'both')

  const before = (await ships(page)).find((s) => s.id === 'maru-1')!
  expect(before.hp).toBe(240)

  // Triggered off the SIMULATED position, not a fixed delay -- see the file
  // header's accuracy note. `waitForFunction` polls on Chromium's own
  // animation-frame cadence, tighter than `expect.poll`'s default interval.
  await page.waitForFunction(
    (x) => ((window as DiagWindow).__ww2?.aircraftPositionM().x ?? -Infinity) >= x,
    releaseX,
    { timeout: 15_000 },
  )
  await page.keyboard.press('KeyV')
  const afterRelease = await combat(page)
  expect(afterRelease.player.stores.bombs, 'V did not take a bomb off the racks').toBe(1)

  // The bomb flies on its own closed form from here -- `flyProjectile` never
  // reads the aircraft again -- so diving now is cosmetic, not part of the
  // ballistics. Purely for the eventual screenshot and the scenario's own
  // "45-degree dive" framing.
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1500)
  await page.keyboard.up('ArrowUp')

  // 17.67 s of fall plus slack for Chromium's own frame pacing and the
  // tunnel's round trip.
  await expect
    .poll(() => ships(page).then((s) => s.find((sh) => sh.id === 'maru-1')!.hp), {
      timeout: (BOMB_FALL_S + 20) * 1000,
    })
    .toBeLessThan(240)
  await page.screenshot({ path: 'test-results/strike-maru-fireball.png' })

  // Paused, a held V releases nothing -- the same check gunnery.spec.ts runs
  // on a held Space.
  const heldStores = (await combat(page)).player.stores
  await page.keyboard.press('Escape')
  await page.keyboard.down('KeyV')
  await page.waitForTimeout(1000)
  await page.keyboard.up('KeyV')
  expect((await combat(page)).player.stores).toEqual(heldStores)
  await page.keyboard.press('Escape')

  await assertNoValidationErrors(page)
})

test('on final to Dulag, three E presses raze a hangar', async ({ page }) => {
  // 800 m out, at a plausible low-circuit altitude for a rocket pass --
  // `groundHeightM`/terrain elevation near Dulag was not measured before
  // writing this, so the dive below is driven by the live simulated
  // altitude rather than a precomputed one.
  const spawnX = hangar1World.x - 800
  await page.goto(spawnQuery(spawnX, 120, hangar1World.z))
  await startWithLoadout(page, 'both')

  const before = (await structures(page)).find((s) => s.id.startsWith('dulag-hangar'))
  expect(before).toBeDefined()

  // A shallow dive toward the strip, closing the last of the 800 m while
  // losing altitude for a level-ish rocket pass -- not levelled off first,
  // since a rocket fired from level flight at 120 m would sail well over a
  // building-height target before gravity had any real effect on it.
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1800)
  await page.keyboard.up('ArrowUp')

  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('KeyE')
    await page.waitForTimeout(400)
  }
  const afterFiring = await combat(page)
  expect(afterFiring.player.stores.rockets, 'E did not take rockets off the rails').toBeLessThan(6)

  await expect
    .poll(() => structures(page).then((s) => s.some((b) => b.id.startsWith('dulag-hangar') && b.hp <= 0)), {
      timeout: 15_000,
    })
    .toBe(true)
  await page.screenshot({ path: 'test-results/strike-dulag-hangar-razed.png' })

  await assertNoValidationErrors(page)
})

test.describe('frame-time budget with stores hanging and ordnance damage up', () => {
  test.use({ viewport: { width: 2560, height: 1440 } })
  const GPU_BUDGET_P95_MS = 6.0

  // Deliberately ONE damaged, smoking hangar rather than the brief's "two
  // smoke columns": the maru is 6 km from Dulag (scenario.test.ts pins the
  // distance) and whether both are simultaneously visible/rendered from one
  // camera position was never measured before writing this. A single
  // Dulag pass, with most of the loadout still hanging (only one rocket
  // volley spent), is the well-understood subset of that scene -- widen it
  // to a second damage site once render distance at Dulag is actually known.
  test('the GPU frame at 1440p over a damaged, smoking Dulag hangar, stores still hanging, stays inside budget', async ({
    page,
  }) => {
    const spawnX = hangar1World.x - 800
    await page.goto(spawnQuery(spawnX, 120, hangar1World.z))
    await startWithLoadout(page, 'both')

    await page.keyboard.down('ArrowUp')
    await page.waitForTimeout(1800)
    await page.keyboard.up('ArrowUp')
    // One volley only -- damage, not destruction, and five of six rockets
    // plus both bombs still hanging on the airframe for the measurement.
    await page.keyboard.press('KeyE')
    await page.waitForTimeout(400)

    const armed = await combat(page)
    expect(armed.player.stores.rockets).toBe(4)
    expect(armed.player.stores.bombs).toBe(2)

    await page.evaluate(() => {
      (window as DiagWindow).__ww2!.resetFrameTimes()
    })
    await page.waitForTimeout(5000)
    const after = await page.evaluate(() => {
      const d = (window as DiagWindow).__ww2!
      return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
    })
    expect(after.errors).toEqual([])
    expect(after.gpu.length).toBeGreaterThan(120)
    const p95 = percentile(after.gpu, 0.95)
    console.log(`strike gpu p95 ${p95.toFixed(3)} ms over ${after.gpu.length} samples`)
    expect(p95).toBeLessThan(GPU_BUDGET_P95_MS)
  })
})

test('restart clears combat, ships and structures back to full, with the same loadout re-armed', async ({
  page,
}) => {
  const spawnX = hangar1World.x - 800
  await page.goto(spawnQuery(spawnX, 120, hangar1World.z))
  await startWithLoadout(page, 'both')

  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(1800)
  await page.keyboard.up('ArrowUp')
  await page.keyboard.press('KeyE')
  await expect
    .poll(() => structures(page).then((s) => s.find((b) => b.id.startsWith('dulag-hangar'))!.hp), { timeout: 10_000 })
    .toBeLessThan(120)
  const damagedHangar = (await structures(page)).find((b) => b.id.startsWith('dulag-hangar'))!

  // End the flight the way contact.spec.ts and gunnery.spec.ts's own restart
  // tests do: keep diving until something (ground or water) raises the
  // debrief, then Restart from it.
  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await page.keyboard.up('ArrowUp')
  await debriefDialog(page).getByRole('button', { name: 'Restart' }).click()

  await expect
    .poll(() => structures(page).then((s) => s.find((b) => b.id === damagedHangar.id)!.hp), { timeout: 10_000 })
    .toBe(120)
  const restartedCombat = await combat(page)
  expect(restartedCombat.player.stores).toEqual({ bombs: 2, rockets: 6 })
  const restartedMaru = (await ships(page)).find((s) => s.id === 'maru-1')!
  expect(restartedMaru.hp).toBe(240)

  await assertNoValidationErrors(page)
})
