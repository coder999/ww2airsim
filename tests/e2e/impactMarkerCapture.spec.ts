import { mkdirSync, writeFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// B2, the impact marker (docs/superpowers/plans/2026-10-10-b2-impact-predictor.md): a bomb and a rocket
// pair released with the Assist on, the marker read through `__ww2.impactMarker()`, and the real impact.
// A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/impact-marker'
const BASE = { x: -29666, z: -47605 } // Tacloban runway centre; the sea east of it is where the Range Test ships sit
test.setTimeout(240_000)

type Sample = {
  tick: number; bombs: number; rockets: number
  point: { x: number; y: number; z: number } | null; kind: string | null
  hits: { x: number; y: number; z: number }[]
}
type RecWindow = DiagWindow & { __b2rec?: Sample[] }

const launch = (loadout: string): string =>
  withParams(spawnUrl({ x: BASE.x + 4000, y: 350, z: BASE.z }), {
    scenario: 'range-test', launch: '1', aircraft: 'f6f-hellcat', loadout, cloudTier: 'off', oceanTier: 'high',
  })

/** One sample per rendered frame: the marker's prediction with the tick it was made from, the store
 *  counts, and the newest detonation, so a release can be lined up with the prediction for its tick. */
async function record(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as RecWindow
    w.__b2rec = []
    const step = (): void => {
      const d = w.__ww2!
      const m = d.impactMarker(), c = d.combat()
      w.__b2rec!.push({
        tick: m.tick, bombs: c?.player.stores.bombs ?? 0, rockets: c?.player.stores.rockets ?? 0,
        point: m.prediction === null ? null : { ...m.prediction.point }, kind: m.prediction?.kind ?? null,
        hits: m.detonations.map((h) => ({ ...h })),
      })
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}
const samples = (page: Page): Promise<Sample[]> => page.evaluate(() => (window as RecWindow).__b2rec!)

async function toChase(page: Page): Promise<void> {
  for (let i = 0; i < 4 && (await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())) !== 'chase'; i++) {
    await page.keyboard.press('KeyC')
    await page.waitForTimeout(400)
  }
}

for (const store of ['bomb', 'rocket'] as const) {
  test(`${store}: the marker shows where it will land, then it lands there`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(launch(store === 'bomb' ? 'bombs' : 'rockets'))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    await page.keyboard.press('Slash') // hide the controls legend for clean captures
    await page.waitForTimeout(500)

    // Off by default: no marker, no prediction work.
    const off = await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
    expect(off.on).toBe(false)
    expect(off.shown).toBe(false)
    expect(off.prediction).toBeNull()

    await page.keyboard.press('KeyU')
    await page.waitForTimeout(900)
    const on = await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
    expect(on.on).toBe(true)
    expect(on.shown, 'a marker is posed').toBe(true)
    expect(on.prediction?.kind).toBe(store)
    expect(on.label).toMatch(store === 'bomb' ? /^IMPACT BOMB [\d.]+ MI$/ : /^IMPACT ROCKET [\d.]+ MI$/)
    await page.screenshot({ path: `${OUT}/${store}-marker-chase.png` })

    await page.keyboard.press('KeyC')
    await page.waitForTimeout(700)
    expect((await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())), 'cockpit').toBe('cockpit')
    expect((await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())).shown, 'shown in the cockpit').toBe(true)
    await page.screenshot({ path: `${OUT}/${store}-marker-cockpit.png` })
    await toChase(page)

    await record(page)
    await page.waitForTimeout(300)
    await page.keyboard.press(store === 'bomb' ? 'KeyV' : 'KeyE')
    await page.waitForTimeout(store === 'bomb' ? 1500 : 500)
    await page.screenshot({ path: `${OUT}/${store}-away.png` })
    // Swing the chase camera round to face back along the track (0.3 deg a pixel, so 600 px is 180 deg),
    // raised a little: the airplane flies on, and the splash is behind it.
    await page.mouse.move(960, 540)
    await page.mouse.down()
    await page.mouse.move(960 + 600, 540 + 90, { steps: 12 })
    // Wait for the sim to put the store somewhere (bounded: a bomb from 350 m is down in about 9 s).
    let done = await samples(page)
    for (let i = 0; i < 60 && done.at(-1)!.hits.length === done[0]!.hits.length; i++) { await page.waitForTimeout(250); done = await samples(page) }
    // The numbers below, read from the sim's own impact ring, are the proof; the pictures are for a person.
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${OUT}/${store}-impact.png` })
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${OUT}/${store}-impact-later.png` })
    await page.mouse.up()
    done = await samples(page)
    const first = done.findIndex((s, i) => i > 0 && (store === 'bomb' ? s.bombs < done[i - 1]!.bombs : s.rockets < done[i - 1]!.rockets))
    expect(first, 'the release was seen').toBeGreaterThan(0)
    const releaseTick = done[first]!.tick
    // The sim launches a store from the state at the START of its tick: the prediction made one tick earlier.
    const before = done.filter((s) => s.tick === releaseTick - 1 && s.point !== null).at(-1)
    const nearest = before ?? done.slice(0, first).filter((s) => s.point !== null).at(-1)!
    // The detonations this release added: the bomb, or both rockets of the pair, whose mean is the marker.
    const added = done.at(-1)!.hits.slice(0, done.at(-1)!.hits.length - done[0]!.hits.length)
    expect(added, 'the store landed').toHaveLength(store === 'bomb' ? 1 : 2)
    const hit = { x: 0, y: 0, z: 0 }
    for (const h of added) { hit.x += h.x / added.length; hit.y += h.y / added.length; hit.z += h.z / added.length }
    const miss = Math.hypot(nearest.point!.x - hit.x, nearest.point!.y - hit.y, nearest.point!.z - hit.z)
    const spread = added.length < 2 ? 0 : Math.hypot(added[0]!.x - added[1]!.x, added[0]!.z - added[1]!.z)
    const result = { store, releaseTick, sampledTick: nearest.tick, exactTick: before !== undefined, predicted: nearest.point, actual: hit, missM: miss, pairSpreadM: spread }
    writeFileSync(`${OUT}/${store}-result.json`, JSON.stringify(result, null, 2))
    console.log(JSON.stringify(result))
    // A bomb is exact to float noise when the release tick was sampled. A rocket pair adds the random
    // dispersion draw (0.12 deg of the flight, a few metres to tens of metres on the ground at a shallow angle).
    expect(miss).toBeLessThan(store === 'bomb' ? (before !== undefined ? 1 : 40) : 60)

    // Off again: the marker goes and the prediction work stops.
    await page.keyboard.press('KeyU')
    await page.waitForTimeout(500)
    const gone = await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
    expect([gone.on, gone.shown, gone.prediction]).toEqual([false, false, null])
    expect((await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors))).toEqual([])
  })
}

// What the marker costs on the GPU, interleaved off/on so drift cancels. Run it under
// `hwlock ryzen-budget` (docs/testing.md); the prediction's CPU cost is not in a GPU timestamp.
test('impact marker: GPU frame time, marker off against on', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(launch('bombs'))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  const arms: Record<'off' | 'on', number[][]> = { off: [], on: [] }
  for (let round = 0; round < 4; round++) {
    for (const arm of ['off', 'on'] as const) {
      const want = arm === 'on'
      if ((await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker().on)) !== want) {
        await page.keyboard.press('KeyU')
        await page.waitForTimeout(300)
      }
      await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
      await page.waitForTimeout(2500)
      arms[arm].push(await page.evaluate(() => [...(window as DiagWindow).__ww2!.gpuFrameTimesMs()]))
    }
  }
  const q = (xs: number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))]!
  const summary = Object.fromEntries((['off', 'on'] as const).map((arm) => {
    const all = arms[arm].flat()
    return [arm, { samples: all.length, p50: +q(all, 0.5).toFixed(3), p95: +q(all, 0.95).toFixed(3) }]
  }))
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/gpu-ab.json`, JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
  expect(summary.off!.samples).toBeGreaterThan(120)
  expect(summary.on!.samples).toBeGreaterThan(120)
})

test('bomb: in a dive the marker rides up the screen onto the target area', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(withParams(spawnUrl({ x: BASE.x + 2500, y: 900, z: BASE.z }), {
    scenario: 'range-test', launch: '1', aircraft: 'f6f-hellcat', loadout: 'bombs', cloudTier: 'off', oceanTier: 'high',
  }))
  await waitForTerrain(page)
  await page.waitForTimeout(2500)
  await page.keyboard.press('Slash')
  await page.keyboard.press('KeyU')
  await page.keyboard.down('KeyW') // nose down
  await page.waitForTimeout(1600)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(500)
  const m = await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker())
  expect(m.shown).toBe(true)
  expect(m.prediction?.kind).toBe('bomb')
  await page.screenshot({ path: `${OUT}/bomb-dive-marker.png` })
})
