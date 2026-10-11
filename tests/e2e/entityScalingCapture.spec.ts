import { appendFileSync, mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { SWARM_PARAMS, SWARM_PROBE_ANCHOR, type SwarmLayout } from '../../src/sim/swarm.js'

/**
 * Entity scaling (plan docs/superpowers/plans/2026-10-10-entity-scaling.md): frame cost against the
 * number of extra AI aircraft and ships (`src/sim/swarm.ts`), in two layouts, at 1440p with the cloud
 * tier forced as `budget.spec.ts` does. A measurement tool, not a test: skipped unless E2E_CAPTURE=1.
 * Run it on the reference GPU under `hwlock ryzen-budget` (docs/testing.md), with ryzen otherwise idle.
 *
 * Per point, four windows on one page load, in this order because a furball drifts out of the camera's
 * view as it fights (each window records how many airframes it ended with in view):
 *  - frozen, 4 s, paused (Esc) right after the settle, so every airframe the layout put in view is still
 *    there and the CPU is nearly idle: the GPU cost of drawing the swarm alone, at the GPU clocks a
 *    GPU-bound frame gets (a CPU-bound frame leaves the GPU idle between frames, and its timestamps
 *    then read a down-clocked GPU);
 *  - 1x, 6 s: GPU p50/p95 (`gpuFrameTimesMs`, budget.spec's method) and, from the SAME frames, the main
 *    thread's work per rendered frame (`cpuFrameSamples`), the sim's ms per tick, draw calls, triangles;
 *  - 3x (`T`), 4 s: the same, with three times the ticks per frame;
 *  - pacing, 1x, 4 s, GPU timestamp sampling OFF (it serializes frames on its resolve): the rAF
 *    interval a player gets. JS heap at the end.
 * One JSON line per point goes to `$E2E_CAPTURE_DIR/entity-scaling.jsonl`, plus an `ENTITY` log line.
 *
 * Knobs: ENTITY_REPEATS (interleaved, repeat outermost) and ENTITY_REP (the first repeat's number), ENTITY_TIERS (high,medium), ENTITY_LAYOUTS
 * (tight,mission), ENTITY_POINTS ("30x0,60x20": aircraft x ships), ENTITY_PARAMS (a query string added
 * to every URL, e.g. `swarmHide=1` for the meshes' share, or `mainBatteries=all`).
 */
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/entity-scaling'
const REPEATS = Number(process.env.ENTITY_REPEATS ?? 1)
/** The first repeat's number, for runs split across invocations (each its own `hwlock` hold). */
const FIRST_REP = Number(process.env.ENTITY_REP ?? 0)
const TIERS = (process.env.ENTITY_TIERS ?? 'high,medium').split(',')
const LAYOUTS = (process.env.ENTITY_LAYOUTS ?? 'tight,mission').split(',') as SwarmLayout[]
const DEFAULT_POINTS = [
  [0, 0], [5, 0], [10, 0], [20, 0], [30, 0], [45, 0], [60, 0],
  [0, 2], [0, 5], [0, 10], [0, 15], [0, 20],
  [30, 10], [60, 20],
] as const
const POINTS = process.env.ENTITY_POINTS === undefined ? DEFAULT_POINTS
  : process.env.ENTITY_POINTS.split(',').map((p) => p.split('x').map(Number) as [number, number])
const EXTRA = Object.fromEntries(new URLSearchParams(process.env.ENTITY_PARAMS ?? ''))
/** Points worth a picture for the handoff, taken on the first repeat at High. */
const SCREENSHOT = new Set(['30x0', '0x10', '30x10', '60x20'])
test.setTimeout(180_000)

const read = (page: Page) => page.evaluate(() => {
  const d = (window as DiagWindow).__ww2!
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null
  return { gpu: d.gpuFrameTimesMs(), raf: d.frameTimesMs(), cpu: d.cpuFrameSamples(), counts: d.entityCounts(), timeScale: d.timeScale(), heapMb: heap === null ? null : heap / 2 ** 20, errors: d.validationErrors }
})
const reset = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
const r3 = (x: number): number => Math.round(x * 1000) / 1000
const p = (xs: readonly number[], q: number): number => r3(percentile(xs, q))

/** One window: GPU percentiles, and main-thread work over the frames that rendered, sim per tick over all. */
function windowStats(w: Awaited<ReturnType<typeof read>>) {
  const rendered = w.cpu.filter((c) => c.rendered)
  const ticks = w.cpu.reduce((s, c) => s + c.ticks, 0)
  return {
    gpuP50: p(w.gpu, 0.5), gpuP95: p(w.gpu, 0.95), gpuN: w.gpu.length,
    workP50: p(rendered.map((c) => c.workMs), 0.5), workP95: p(rendered.map((c) => c.workMs), 0.95),
    simMsPerTick: r3(w.cpu.reduce((s, c) => s + c.simMs, 0) / Math.max(1, ticks)),
    simP95: p(w.cpu.map((c) => c.simMs), 0.95), ticksPerFrame: r3(ticks / Math.max(1, w.cpu.length)),
    drawCalls: percentile(rendered.map((c) => c.drawCalls), 0.5), triangles: percentile(rendered.map((c) => c.triangles), 0.5),
    inView: w.counts.aircraftInView, shipsInView: w.counts.shipsInView, down: w.counts.aircraftDown, rounds: w.counts.projectiles,
  }
}

for (let r = FIRST_REP; r < FIRST_REP + REPEATS; r++) for (const tier of TIERS) for (const layout of LAYOUTS) for (const [aircraft, ships] of POINTS) {
  const point = `${aircraft}x${ships}`
  test(`entities ${layout} ${point} ${tier} #${r}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    const a = SWARM_PROBE_ANCHOR
    await page.goto(withParams(spawnUrl({ x: a.x, y: a.y, z: a.z }), {
      cloudTier: tier, oceanTier: 'high', god: '1', invariants: 'off',
      [SWARM_PARAMS.aircraft]: String(aircraft), [SWARM_PARAMS.ships]: String(ships), [SWARM_PARAMS.layout]: layout, ...EXTRA,
    }))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    const start = await read(page)
    expect(start.counts.aircraft).toBe(aircraft + 2) // free-flight's two, plus the swarm
    expect(start.counts.ships).toBe(ships + 3)

    await page.keyboard.press('Escape')
    const pauseMenu = page.getByRole('dialog', { name: 'Pause menu' })
    await expect(pauseMenu).toBeVisible()
    await page.waitForTimeout(500)
    await reset(page)
    await page.waitForTimeout(4000)
    const frozen = await read(page)
    expect(frozen.cpu.every((c) => c.ticks === 0), 'the sim ran while paused').toBe(true)
    await pauseMenu.getByRole('button', { name: 'Resume' }).click()
    await expect(pauseMenu).toBeHidden()

    await reset(page)
    await page.waitForTimeout(6000)
    const w1 = await read(page)
    // A small floor: at 60 + 20 tight a frame can take 100 ms+, so 6 s may hold only a few dozen samples.
    expect(w1.gpu.length, 'no GPU timestamp samples').toBeGreaterThan(5)
    if (r === 0 && tier === 'high' && SCREENSHOT.has(point)) await page.screenshot({ path: `${OUT}/${layout}-${point}${EXTRA.swarmHide === '1' ? '-hidden' : ''}.png` })

    await page.keyboard.press('KeyT')
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(3)
    await page.waitForTimeout(500)
    await reset(page)
    await page.waitForTimeout(4000)
    const w3 = await read(page)
    await page.keyboard.press('KeyT')
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(1)

    await page.evaluate(() => (window as DiagWindow).__ww2!.setGpuSampling(false))
    await reset(page)
    await page.waitForTimeout(4000)
    const pace = await read(page)

    const row = {
      layout, aircraft, ships, tier, rep: r, params: process.env.ENTITY_PARAMS ?? '', inViewAtStart: start.counts.aircraftInView,
      frozen: windowStats(frozen), x1: windowStats(w1), x3: windowStats(w3),
      pace: { rafP50: p(pace.raf, 0.5), rafP95: p(pace.raf, 0.95), workP50: p(pace.cpu.map((c) => c.workMs), 0.5), workP95: p(pace.cpu.map((c) => c.workMs), 0.95), inView: pace.counts.aircraftInView },
      heapMb: pace.heapMb === null ? null : r3(pace.heapMb),
    }
    expect(w3.timeScale).toBe(3)
    // Not 3x: at the heaviest points both speeds hit MAX_STEPS_PER_FRAME (5) and drop steps.
    expect(row.x3.ticksPerFrame, '3x ran no faster than 1x').toBeGreaterThan(row.x1.ticksPerFrame)
    console.log(`ENTITY ${JSON.stringify(row)}`)
    appendFileSync(`${OUT}/entity-scaling.jsonl`, JSON.stringify(row) + '\n')
    expect([...frozen.errors, ...w1.errors, ...pace.errors]).toEqual([])
  })
}
