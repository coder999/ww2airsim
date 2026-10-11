import { appendFileSync, mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { SWARM_PARAMS, SWARM_PROBE_ANCHOR, type SwarmLayout } from '../../src/sim/swarm.js'
import type { CpuFrameSample } from '../../src/render/diagnostics.js'

/**
 * Entity scaling (plan docs/superpowers/plans/2026-10-10-entity-scaling.md): frame cost against the
 * number of extra AI aircraft and ships (`src/sim/swarm.ts`), in two layouts, at 1440p with the cloud
 * tier forced as `budget.spec.ts` does. A measurement tool, not a test: skipped unless E2E_CAPTURE=1.
 * Run it on the reference GPU under `hwlock ryzen-budget` (docs/testing.md), with ryzen otherwise idle.
 *
 * Per point, three windows on one page load:
 *  - GPU: `gpuFrameTimesMs` p50/p95 (budget.spec's method), draw calls and triangles per rendered frame;
 *  - CPU at 1x and at 3x (`T`), with GPU timestamp sampling OFF so frames are not serialized on its
 *    resolve: the rAF interval, the main thread's work per frame (`cpuFrameSamples`), and the sim's
 *    share of it per tick;
 *  - JS heap, and how many airframes and hulls the camera has in view.
 * One JSON line per point goes to `$E2E_CAPTURE_DIR/entity-scaling.jsonl`, plus an `ENTITY` log line.
 *
 * Knobs: ENTITY_REPEATS (interleaved, repeat outermost), ENTITY_TIERS (high,medium), ENTITY_LAYOUTS
 * (tight,mission), ENTITY_POINTS ("30x0,60x20": aircraft x ships), ENTITY_PARAMS (a query string added
 * to every URL, e.g. `swarmHide=1` for the meshes' share, or `mainBatteries=all`).
 */
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/entity-scaling'
const REPEATS = Number(process.env.ENTITY_REPEATS ?? 1)
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

const diag = (page: Page) => ({
  reset: () => page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes()),
  read: () => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null
    return { gpu: d.gpuFrameTimesMs(), raf: d.frameTimesMs(), cpu: d.cpuFrameSamples(), counts: d.entityCounts(), timeScale: d.timeScale(), heapMb: heap === null ? null : heap / 2 ** 20, errors: d.validationErrors }
  }),
})
const r3 = (x: number): number => Math.round(x * 1000) / 1000

/** The CPU side of one window: rAF interval and main-thread work percentiles, and sim ms per tick. */
function cpuStats(raf: readonly number[], cpu: readonly CpuFrameSample[]) {
  const ticks = cpu.reduce((s, c) => s + c.ticks, 0)
  return {
    frames: cpu.length,
    rafP50: r3(percentile(raf, 0.5)), rafP95: r3(percentile(raf, 0.95)),
    workP50: r3(percentile(cpu.map((c) => c.workMs), 0.5)), workP95: r3(percentile(cpu.map((c) => c.workMs), 0.95)),
    simP95: r3(percentile(cpu.map((c) => c.simMs), 0.95)),
    simMsPerTick: r3(cpu.reduce((s, c) => s + c.simMs, 0) / Math.max(1, ticks)),
    ticksPerFrame: r3(ticks / Math.max(1, cpu.length)),
  }
}

for (let r = 0; r < REPEATS; r++) for (const tier of TIERS) for (const layout of LAYOUTS) for (const [aircraft, ships] of POINTS) {
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
    const d = diag(page)

    await d.reset()
    await page.waitForTimeout(6000)
    const g = await d.read()
    expect(g.gpu.length, 'no GPU timestamp samples').toBeGreaterThan(30)
    expect(g.counts.aircraft).toBe(aircraft + 2) // free-flight's two, plus the swarm
    expect(g.counts.ships).toBe(ships + 3)
    const rendered = g.cpu.filter((c) => c.rendered)
    if (r === 0 && tier === 'high' && SCREENSHOT.has(point)) await page.screenshot({ path: `${OUT}/${layout}-${point}${EXTRA.swarmHide === '1' ? '-hidden' : ''}.png` })

    await page.evaluate(() => (window as DiagWindow).__ww2!.setGpuSampling(false))
    await d.reset()
    await page.waitForTimeout(5000)
    const c1 = await d.read()
    await page.keyboard.press('KeyT')
    await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(3)
    await page.waitForTimeout(1000)
    await d.reset()
    await page.waitForTimeout(5000)
    const c3 = await d.read()
    await page.keyboard.press('KeyT')

    const row = {
      layout, aircraft, ships, tier, rep: r, params: process.env.ENTITY_PARAMS ?? '',
      gpuP50: r3(percentile(g.gpu, 0.5)), gpuP95: r3(percentile(g.gpu, 0.95)), gpuN: g.gpu.length,
      drawCalls: percentile(rendered.map((c) => c.drawCalls), 0.5), triangles: percentile(rendered.map((c) => c.triangles), 0.5),
      inView: { aircraft: g.counts.aircraftInView, ships: g.counts.shipsInView, aircraftEnd: c3.counts.aircraftInView },
      down: c3.counts.aircraftDown, rounds: g.counts.projectiles,
      cpu1x: cpuStats(c1.raf, c1.cpu), cpu3x: cpuStats(c3.raf, c3.cpu), heapMb: c3.heapMb === null ? null : r3(c3.heapMb),
    }
    expect(c3.timeScale).toBe(3)
    expect(row.cpu3x.ticksPerFrame, '3x ran no faster than 1x').toBeGreaterThan(row.cpu1x.ticksPerFrame * 2)
    console.log(`ENTITY ${JSON.stringify(row)}`)
    appendFileSync(`${OUT}/entity-scaling.jsonl`, JSON.stringify(row) + '\n')
    expect([...g.errors, ...c3.errors]).toEqual([])
  })
}
