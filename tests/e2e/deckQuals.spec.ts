import { test, expect } from '@playwright/test'
import { debriefDialog, percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

/**
 * Tier 2, carrier operations (Plan 8). Same platform and caveats as
 * `adapter.spec.ts`: a real GPU on the Windows reference desktop, never
 * hosted CI. Run it with the README's Tier 2 command.
 *
 * What only this tier can prove is the WIRING of a whole plan whose pieces
 * are each unit-tested: `?scenario=deck-quals` selecting a different world at
 * boot, the scenario's wind reaching `step()`, `groundUnder` handing a moving
 * steel surface to the ground constraint frame after frame, and the deck and
 * trap band being drawn where the simulation actually puts them. The Plan 3
 * defect class -- a feature that ships inert while its own unit tests pass,
 * because they call the module directly -- is invisible below this tier.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const URL = `/?${SCENARIO_PARAM}=deck-quals`

/**
 * The deck run is real time, because the simulation is: the spot is 241 m
 * from the bow and the roll takes something over ten seconds on top of the
 * terrain fetch and the climb-out. The config's 60 s default would report
 * "the airplane never got airborne" when the truth is "the clock ran out".
 */
test.setTimeout(180_000)

test('deck quals: the player is parked on the moving deck and sails with the carrier', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL)
  await waitForTerrain(page)
  const read = () => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { deck: d.deck(), me: d.aircraft().find((a) => a.id === 'f6f-1')!, cv: d.ships().find((s) => s.id === 'cv-1')!, tick: d.tick(), wind: d.wind(), errors: d.validationErrors }
  })
  const a = await read()
  expect(a.deck?.shipId).toBe('cv-1')
  expect(a.wind).not.toBeNull()
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  await page.waitForTimeout(5000)
  const b = await read()
  const elapsedS = (b.tick - a.tick) / 60
  expect(elapsedS).toBeGreaterThan(3)
  const shipMoved = Math.hypot(b.cv.x - a.cv.x, b.cv.z - a.cv.z)
  const meMoved = Math.hypot(b.me.x - a.me.x, b.me.z - a.me.z)
  expect(shipMoved).toBeGreaterThan(7.717 * elapsedS * 0.9)
  // Parked: carried by the deck, to within a meter of the ship's own travel.
  expect(Math.abs(meMoved - shipMoved)).toBeLessThan(1)
  expect(b.deck?.shipId).toBe('cv-1')
  expect(b.errors).toEqual([])
  // 15 kn of ship speed into 15 kn of wind: 35 mph airspeed, not 17 mph ground speed.
  await expect(page.getByLabel('Flight data', { exact: true })).toContainText('SPD 35 mph')
  await page.screenshot({ path: 'test-results/deck-quals-parked.png' })
})

// Renamed 2026-09-19 (Plan 8 review, item 4): this used to say "with the trap
// zone and cue in view", which the screenshots it takes do not show -- the
// chase camera looks FORWARD, so the carrier is behind the airplane by the
// time this asserts. What it measures is the climb-out and the frame budget.
test('deck quals: a full-throttle deck run gets airborne off the bow and climbs out over the water inside the frame budget', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.keyboard.down('Equal')
  // Rotate once the run is well along; the deck is 262.7 m and the spot 241 m from the bow.
  await page.waitForTimeout(9000)
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1200)
  await page.keyboard.up('ArrowDown')
  await page.waitForFunction(
    ([gearHeightM, toleranceM]) => {
      const d = (window as DiagWindow).__ww2!
      const groundM = d.groundHeightM()
      if (groundM === null) return false
      return !d.supportedContact() && d.aircraftPositionM().y - gearHeightM - groundM > toleranceM
    },
    [f6f.gear.heightM, GROUND_CONTACT_TOLERANCE_M] as const,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(2000)
  const after = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { supported: d.supportedContact(), impact: d.impact(), deck: d.deck(), errors: d.validationErrors, gpu: d.gpuFrameTimesMs() }
  })
  expect(after.supported).toBe(false)
  expect(after.impact, 'the deck run ended in an impact').toBeNull()
  expect(after.deck).toBeNull()
  expect(after.errors).toEqual([])
  expect(after.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(after.gpu, 0.95)
  console.log(`deck quals gpu p95 ${p95.toFixed(3)} ms over ${after.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
  await page.keyboard.up('Equal')
  await page.screenshot({ path: 'test-results/deck-quals-airborne.png' })
})

test('H toggles the hook and is listed in the legend', async ({ page }) => {
  await page.goto(URL)
  await waitForTerrain(page)
  await page.keyboard.press('KeyH')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.controls().hookDown)).toBe(true)
  await expect(page.getByText(/Hook\s+H/)).toBeVisible()
  await expect(debriefDialog(page)).toBeHidden()
})
