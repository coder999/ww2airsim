import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
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
  // Clearing the bow is polled, not sampled: two seconds after the wheels
  // leave the deck the airplane is about 3 m past the bow (measured
  // 2026-09-19, 134 m ahead of the ship's centre against a 131.35 m
  // half-length), and a fixed wait tipped either way with the frame timing
  // -- it failed twice in a row the day the clouds landed and passed in
  // every replay that logged the numbers.
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.deck()), { timeout: 10_000 }).toBeNull()
  await page.waitForTimeout(1000)
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

/**
 * Photoreal Task 12 (spec §4.5): the carrier deck must read as a lit surface.
 * Before it, the deck in deck-quals rendered at mean gray 1.0 of 255: the
 * 16.5 h sun is 19.6 deg up, its path through the 55% cumulus deck puts the
 * whole local sea in cloud shadow (T = 0.004 at the airplane), and the only
 * light left was the CLEAR sky's fill -- the scattered skylight of the clouds
 * themselves was missing (lighting.ts `cloudSkylightNode`, the fix).
 *
 * `DECK_RECT` is a fixed rectangle of the 2560x1440 frame below the parked
 * airframe and its chocks, on the flight deck in deck-quals and on the
 * asphalt in the runway view (chosen from the Task 12 captures, 2026-09-25).
 */
const DECK_RECT = { x: 700, y: 1150, w: 1200, h: 230 } as const
async function meanGray(page: Page, url: string): Promise<number> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(url)
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  const png = await page.screenshot()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  return page.evaluate(async ({ base64, r }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data } = ctx.getImageData(r.x, r.y, r.w, r.h)
    let sum = 0
    for (let p = 0; p < r.w * r.h; p++) sum += 0.2126 * data[p * 4]! + 0.7152 * data[p * 4 + 1]! + 0.0722 * data[p * 4 + 2]!
    return sum / (r.w * r.h)
  }, { base64: png.toString('base64'), r: DECK_RECT })
}

test('the carrier deck reads as a lit surface: within 0.5-1.5x the runway under the same sun, and not black in cloud shadow (photoreal Task 12)', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  // Matched light: the deck-quals sun on both, cloud shadow off so where a
  // cloud's shadow happens to fall does not decide the comparison. What is
  // left is material and lighting -- the defects a black deck could have.
  const matched = { cloudTier: 'high', oceanTier: 'high', timeOfDay: '16.5', cloudShadow: 'off' }
  const q = (params: Record<string, string>) => new URLSearchParams(params).toString()
  const runway = await meanGray(page, `/?${q(matched)}`)
  const deck = await meanGray(page, `${URL}&${q(matched)}`)
  // As shipped, in the cloud shadow: lit by the sky and the clouds alone.
  const shadowed = await meanGray(page, `${URL}&${q({ cloudTier: 'high', oceanTier: 'high' })}`)
  console.log(`deck luminance: runway ${runway.toFixed(1)} deck ${deck.toFixed(1)} ratio ${(deck / runway).toFixed(3)} shadowed deck ${shadowed.toFixed(1)}`)
  expect(deck / runway).toBeGreaterThanOrEqual(0.5)
  expect(deck / runway).toBeLessThanOrEqual(1.5)
  // 1.0 before the fix; the floor is well clear of black and well under what
  // the fix measured, so cloud drift across the deck cannot flip it.
  expect(shadowed).toBeGreaterThan(5)
  expect(errors).toEqual([])
})

/**
 * Ship models (S1, spec §9): the rendered deck of the LOADED, POSED carrier
 * model is where the sim rests the wheels. `shipDeckProbe` ray-casts the
 * ship's own view straight down, ignoring the airplane. Under the parked
 * airplane it reads the origin and 1.7 m either side (half the F6F's main-gear
 * track, an ESTIMATE; the sim has one contact point). In ship coordinates it
 * reads the trap zone's center, where the band sits 0.05 m proud, and 5 m
 * short of the bow. The deck is rigid, so the deck run adds nothing to these.
 */
test('the rendered carrier deck is where the sim rests the wheels (ship models S1)', async ({ page }) => {
  const cvSpec = loadShipSpec('essex-cv')
  const fd = cvSpec.flightDeck!, tz = cvSpec.trapZone!
  const marks = [{ x: -fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2, z: 0 }, { x: fd.lengthM / 2 - 5, z: 0 }]
  await page.goto(URL)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  const r = await page.evaluate((m) => {
    const d = (window as DiagWindow).__ww2!
    const me = d.aircraft().find((a) => a.id === 'f6f-1')!
    const right = { x: Math.cos(me.headingRad), z: Math.sin(me.headingRad) }
    const wheels = [0, -1.7, 1.7].map((s) => ({ x: me.x + s * right.x, z: me.z + s * right.z }))
    return { models: d.shipModels(), deck: d.deck(), wheels: d.shipDeckProbe('cv-1', wheels, 'world'), marks: d.shipDeckProbe('cv-1', m, 'ship'), errors: d.validationErrors }
  }, marks)
  expect(r.models[0]).toBe('essex-cv')
  expect(r.deck?.shipId).toBe('cv-1')
  const simDeck = r.deck!.heightM
  for (const [i, y] of [...r.wheels, ...r.marks].entries()) {
    expect(y, `probe ${i} hit nothing`).not.toBeNull()
    expect(Math.abs(y! - simDeck), `probe ${i}: rendered ${y} vs sim ${simDeck}`).toBeLessThanOrEqual(0.2)
  }
  expect(r.errors).toEqual([])
})
