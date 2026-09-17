import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'
import { DEFAULT_SPAWN_POSITION } from '../../src/render/spawn.js'

/**
 * Tier 2, take-off. Same platform and caveats as `adapter.spec.ts`: a real
 * GPU on the Windows reference desktop, never hosted CI.
 *
 * **NOT EXECUTED as of 2026-09-17.** Written on nexus, which has no GPU a
 * browser can reach. Run it with:
 *
 *     npx playwright test tests/e2e/takeoff.spec.ts
 *
 * This is Plan 11a's one end-to-end statement that the whole thing works:
 * terrain arrives, the airplane is standing on its wheels on a runway, full
 * throttle rolls it, and it leaves the ground and stays off it. Every part of
 * that is unit-tested in isolation (`tests/sim/ground.test.ts`,
 * `tests/render/frame.test.ts`), and Plan 11a's own handoff records that the
 * soak's assertions shipped covering zero ticks -- so "the pieces pass
 * individually" has already proven not to mean the production path works.
 */
const f6f = loadAircraftSpec('f6f-hellcat')

/**
 * The roll is real time, because the simulation runs at real time: rotation
 * comes up 410-453 m into the roll (Plan 11a's handoff), which is something
 * over twenty seconds of accelerating from a standstill, and the climb-out
 * and the terrain fetch sit on top of that. The config's 60 s default is not
 * enough and a failure against it would read as "the airplane never got
 * airborne" rather than "the clock ran out".
 */
test.setTimeout(150_000)

/** Metres of roll before the nose comes up. Short of the 410 m minimum the
 *  handoff measured, so the rotation input lands during the roll rather than
 *  after the airplane has already staggered off the ground on its own. */
const ROTATE_AFTER_M = 380

test('rolls off the Tacloban runway under full throttle and stays airborne', async ({ page }) => {
  // No query string on purpose. This is the DEFAULT spawn -- parked on the
  // runway, gear down, nose north. Deliberately NOT the `?spawnX/Y/Z` the
  // plan's brief suggested: `hasSpawnOverride` (src/render/spawn.ts) turns
  // `groundSpawn` OFF for any override, so that URL would hand this test an
  // airborne airplane at 120 m/s with its gear retracted and no terrain hold.
  // The override exists to move the airplane AWAY from the runway; a take-off
  // test wants exactly what a pilot gets.
  await page.goto('/')
  await waitForTerrain(page)

  // Standing on its wheels before anything else. This assertion is what makes
  // the rest of the test mean something: a test that only checks the airplane
  // ends up airborne passes identically on one that was never on the ground,
  // which is precisely what the old `(0, 600, 0)` default would have given it.
  // `supportedContact()` is also the only outside view of the gate chain Plan
  // 11a got wrong four separate times -- gear down, sink rate, speed cap, and
  // the surface being land.
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 })
    .toBe(true)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.impact())).toBeNull()

  const start = await page.evaluate(() => {
    const p = (window as DiagWindow).__ww2!.aircraftPositionM()
    return { x: p.x, y: p.y, z: p.z }
  })
  // Confirms the spawn is where this test thinks it is before spending two
  // minutes rolling. A wrong spawn would otherwise show up as a mystifying
  // timeout, or worse, as a pass from somewhere else entirely.
  expect(Math.hypot(start.x - DEFAULT_SPAWN_POSITION.x, start.z - DEFAULT_SPAWN_POSITION.z)).toBeLessThan(1)

  // Phase 1: full throttle, no pitch input, until it has rolled far enough to
  // rotate. `ShiftLeft` integrates the throttle and holds it after release
  // (`controlsFromKeys`, src/input/keyboard.ts), so it stays down for the
  // whole flight from here.
  await page.keyboard.down('ShiftLeft')
  await page.waitForFunction(
    ([sx, sz, needM]) => {
      const p = (window as DiagWindow).__ww2!.aircraftPositionM()
      return Math.hypot(p.x - sx, p.z - sz) > needM
    },
    [start.x, start.z, ROTATE_AFTER_M] as const,
    { timeout: 90_000 },
  )

  // The roll must have gone NORTH, down the strip, not east across it -- the
  // whole reason `DEFAULT_SPAWN_ATTITUDE` exists. Asserted here and not only
  // in Tier 1 because the spawn attitude reaches the simulation through
  // `main.ts`, which no Tier 1 test can execute.
  const rolled = await page.evaluate(() => {
    const p = (window as DiagWindow).__ww2!.aircraftPositionM()
    return { x: p.x, z: p.z }
  })
  const alongM = rolled.z - start.z
  const acrossM = Math.abs(rolled.x - start.x)
  expect(alongM, 'the roll did not go north').toBeGreaterThan(ROTATE_AFTER_M / 2)
  expect(acrossM, 'the airplane wandered off the side of the strip').toBeLessThan(alongM / 10)

  // Phase 2: rotate. A BOUNDED nose-up input, held about a second and a half
  // and then released -- a full, indefinitely-held deflection over-rotates
  // into a climbing stall and porpoises back into the ground, which
  // `tests/render/frame.test.ts` records observing while it was built. This is
  // what a pilot does, and it is what must stay crash-free.
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1500)
  await page.keyboard.up('ArrowDown')

  // Phase 3: genuinely off the ground and STAYING off it. Both halves matter:
  // `supportedContact()` going false alone would also be true of an airplane
  // that had just bounced, and a height check alone cannot tell the wheels
  // from the body origin, which sits `gear.heightM` above them even parked.
  await page.waitForFunction(
    ([gearHeightM, toleranceM]) => {
      const d = (window as DiagWindow).__ww2!
      const groundM = d.groundHeightM()
      if (groundM === null) return false
      const wheelsAboveGroundM = d.aircraftPositionM().y - gearHeightM - groundM
      return !d.supportedContact() && wheelsAboveGroundM > toleranceM
    },
    [f6f.gear.heightM, GROUND_CONTACT_TOLERANCE_M] as const,
    { timeout: 30_000 },
  )
  // Held, not instantaneous: a single noisy tick clear of the tolerance is not
  // a take-off. Plan 11a's own liftoff bug was a position clamp producing an
  // exactly-one-tick 15.001 m/s catapult, which a one-shot check would pass.
  await page.waitForTimeout(2000)
  const settled = await page.evaluate(
    ([gearHeightM]) => {
      const d = (window as DiagWindow).__ww2!
      const groundM = d.groundHeightM()
      return {
        supported: d.supportedContact(),
        wheelsAboveGroundM: groundM === null ? null : d.aircraftPositionM().y - gearHeightM - groundM,
        impact: d.impact(),
        errors: d.validationErrors,
      }
    },
    [f6f.gear.heightM] as const,
  )
  expect(settled.supported, 'came back down onto its wheels').toBe(false)
  expect(settled.wheelsAboveGroundM).not.toBeNull()
  expect(settled.wheelsAboveGroundM!).toBeGreaterThan(GROUND_CONTACT_TOLERANCE_M)
  expect(settled.impact, 'the flight ended in an impact').toBeNull()
  // Only trusted last, and only because every phase above proved it took
  // effect: an empty error list on a take-off that never happened would be
  // indistinguishable from a passing run.
  expect(settled.errors).toEqual([])

  await page.keyboard.up('ShiftLeft')
})
