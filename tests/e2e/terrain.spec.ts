import { test, expect } from '@playwright/test'
import { flySweep, percentile, snapshot, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2, terrain. Same platform and same caveats as `adapter.spec.ts`; this
 * file is the half that needs the aeroplane to be somewhere specific.
 *
 * **Where, and why there.** The aeroplane spawns over open water 23 km from
 * the nearest land, which is three minutes' flying -- so these tests move it
 * with `?spawnX/Y/Z` (see `src/render/spawn.ts` for why a URL is allowed to
 * and why it cannot in a build that ships). The point chosen is on Tacloban
 * airfield's own latitude line, 15.3 km due west of it, so the eastbound
 * spawn heading flies the Leyte coastal plain back toward the airfield:
 *
 *   Tacloban airfield  11.228 N 125.028 E  ->  (-29666, 47605) world metres
 *
 * That coordinate is not invented here. It is the one
 * `tests/tools/terrainBuild.test.ts` already carries, sourced independently of
 * this pipeline and cross-checked against the Copernicus source tiles on
 * 2026-09-14. Measured over the committed L4 grid on 2026-09-14, the ground
 * along the corridor from the spawn eastward reads 18, 16, 15, 15, 16, 15 m
 * at 0..5 km and rises to 162 m at 10 km, and the highest ground within 30 km
 * is 1,196 m -- i.e. the aeroplane is genuinely over land, with real relief in
 * the frame, at every altitude below.
 */
const SPAWN_X_M = -45000
const SPAWN_Z_M = 47605

/**
 * 100 m is inside the finest LOD ring with the ground filling the lower half
 * of the frame; 3,000 m is the altitude the rest of the plan's arithmetic is
 * written at (the curvature sink, the fog); 8,000 m is near the altimeter's
 * useful top, where the coarse rings and the fog dominate and the finest ring
 * is a small disc under the aeroplane. Three different LOD compositions, one
 * sweep each.
 */
const ALTITUDES_M = [100, 3000, 8000]

for (const altitudeM of ALTITUDES_M) {
  test(`a camera sweep over Leyte at ${altitudeM} m produces zero WebGPU validation errors`, async ({
    page,
  }) => {
    await page.goto(spawnUrl({ x: SPAWN_X_M, y: altitudeM, z: SPAWN_Z_M }))
    await waitForTerrain(page)

    const start = await snapshot(page)

    // Prove the spawn landed BEFORE trusting anything downstream. The default
    // spawn is (0, 600, 0), which is 65.5 km from this one horizontally and
    // over open water -- so a `spawnX/Y/Z` that never took effect (renamed
    // parameter, production build served by mistake, a `spawn.ts` that fell
    // back silently) cannot satisfy this, and without it every assertion in
    // this file would pass over an empty sea. 5 km of slack because the
    // aeroplane has been flying east at 120 m/s since the first frame, while
    // the nine level fetches were still landing.
    expect(Math.hypot(start.position.x - SPAWN_X_M, start.position.z - SPAWN_Z_M), 'spawn did not land').toBeLessThan(
      5000,
    )
    expect(start.position.y, 'spawn altitude did not land').toBeGreaterThan(altitudeM - 300)

    // ...and prove there is terrain under it. `groundHeightM()` is null until
    // the heightfield reaches the simulation and exactly 0 over water, so a
    // positive number here is the one available proof that this test is
    // looking at Leyte rather than at the sea.
    expect(start.groundHeightM, 'no terrain under the aeroplane').not.toBeNull()
    expect(start.groundHeightM!, 'the aeroplane is over water, not over Leyte').toBeGreaterThan(0)

    await flySweep(page)

    const end = await snapshot(page)
    // The aeroplane must have covered real ground during the sweep, not just
    // ticked. `flySweep` proves the keys were delivered and the loop ran;
    // this proves the world moved under the camera, which is what puts new
    // LOD patches through selection, upload and draw. The sweep is ~6 s of
    // held keys, which is ~700 m at the spawn's 120 m/s, so 200 m is a floor
    // with room for the pitch and roll deflections bleeding speed -- not a
    // target.
    expect(
      Math.hypot(end.position.x - start.position.x, end.position.z - start.position.z),
      'the aeroplane did not move during the sweep',
    ).toBeGreaterThan(200)

    expect(end.errors, `WebGPU validation errors:
${JSON.stringify(end.errors, null, 2)}`).toEqual([])
  })
}

/**
 * The frame-time budget, and the one number in this plan that could only ever
 * come from this machine.
 *
 * **It is a GPU pass duration, not a frame interval, and that is forced.**
 * `requestAnimationFrame` on the reference desktop fires every 10.0 ms and
 * nothing moves it: measured 2026-09-14 against a blank page carrying no
 * WebGPU at all, and against `--disable-gpu-vsync`,
 * `--disable-frame-rate-limit`, `--disable-features=CalculateNativeWinOcclusion`
 * and combinations of them -- all five configurations reported the same
 * 9.9-10.0 ms median (task-11-report.md has the table). Task 10's "10.0 ms
 * with terrain against 9.9 ms without" was that cap measured twice, which is
 * why it is not quoted as a baseline anywhere. So the budget is written
 * against WebGPU timestamp queries around the render pass
 * (`window.__ww2.gpuFrameTimesMs()`), which are on the GPU's own clock and
 * cannot see vsync.
 *
 * **What the measurement was.** 2026-09-14, this spawn at 3,000 m, a 5-second
 * window after a 1.5 s settle, 2560x1440:
 *
 *   altitude   GPU p50   GPU p95   GPU max   rAF interval p50 / max
 *      100 m   2.032     2.294     2.425     9.9 / 10.8
 *    3,000 m   2.097     2.359     2.490     9.9 / 10.7
 *    8,000 m   1.769     2.097     2.228     9.9 / 10.9
 *
 * all in milliseconds over ~515 frames each. The values are quantised to
 * multiples of 65.54 us (2^16 ns) -- Chromium quantises timestamp-query
 * results -- so 0.066 ms is the resolution of every number here, and any
 * difference of one step is not a difference.
 *
 * **The 1440p surface, stated precisely because it is easy to overclaim.** The
 * remote browser runs HEADED on the Windows desktop, and `test.use` below sets
 * a Playwright viewport, which is a CDP device-metrics override rather than a
 * window resize -- `window.screen` reports whatever the override says, so it
 * cannot be used to confirm a real 1440p monitor and this comment does not.
 * What IS confirmed, and is the part that decides how much work the GPU does:
 * `canvas.width x canvas.height` is 2560 x 1440 with `devicePixelRatio` 1.0
 * (measured 2026-09-14), i.e. the swap-chain texture really is 3.7 Mpx, with
 * MSAA on (`antialias: true`, renderer.ts). Whether the compositor then
 * scales that down for a smaller window costs the GPU nothing this test is
 * measuring.
 *
 * **Why 3.5 ms.** Two things meet there. It is a third of the platform's 10.0
 * ms frame interval -- the share the GPU can take while leaving the
 * simulation, three's submission and the compositor the rest -- and it is
 * ~1.5x the worst p95 above, which is enough margin for a shared desktop
 * without being so loose that a regression hides in it. Proven to bite:
 * `LOD.quadsPerNode` 64 -> 128 (four times the vertices, the same terrain)
 * measured 4.129 p50 / 4.194 p95 and fails this, while the plan's other
 * candidate regression -- `finestRangeM` at 4x node size -- measured 2.949
 * and does not, which is the right outcome for a setting that is a taste
 * question rather than a defect.
 */
test.describe('frame-time budget', () => {
  test.use({ viewport: { width: 2560, height: 1440 } })

  /** Milliseconds of GPU render pass, 95th percentile. See the block comment. */
  const GPU_BUDGET_P95_MS = 3.5
  /** Milliseconds of wall-clock frame interval, 95th percentile. NOT a budget
   *  -- at 100 Hz this can only ever read ~10 -- but a doubled interval is a
   *  missed vsync, and no GPU-side pass duration reports one. 15 ms sits
   *  between one refresh and two with room on both sides. */
  const INTERVAL_P95_MS = 15

  /** Settle before measuring: the LOD rings re-pack, textures upload, and
   *  three compiles a pipeline per ring on first draw. None of that is the
   *  steady-state frame this budget is about. */
  const SETTLE_MS = 1500
  const WINDOW_MS = 5000

  test('the GPU frame at 1440p over Leyte stays inside its budget', async ({ page }) => {
    await page.goto(spawnUrl({ x: SPAWN_X_M, y: 3000, z: SPAWN_Z_M }))
    await waitForTerrain(page)

    const surface = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')!
      return {
        supported: (window as DiagWindow).__ww2!.gpuTimestampsSupported,
        canvas: [canvas.width, canvas.height] as const,
        dpr: window.devicePixelRatio,
      }
    })

    // Without this the budget passes on an empty array, i.e. on a machine that
    // cannot be timed at all -- the same shape of false pass the spawn check
    // above closes.
    expect(surface.supported, 'the adapter has no timestamp-query feature; this budget cannot be measured').toBe(
      true,
    )
    // And the budget is only a 1440p budget if the surface is 1440p. A
    // viewport that silently failed to apply would report a smaller canvas and
    // a comfortably-passing, meaningless number.
    expect(surface.canvas[0] * surface.canvas[1], `canvas was ${surface.canvas.join('x')}`).toBe(2560 * 1440)

    // Over Leyte, not over the sea. Found by mutation on 2026-09-14: with
    // `spawn.ts` neutered so the query string was ignored, the three sweeps
    // above failed on "spawn did not land" and this test carried on happily
    // over open water, reporting 2.228/2.490 ms -- a plausible-looking budget
    // for a scene with no terrain in it. Same guard, same reason, as the
    // sweeps.
    const over = await snapshot(page)
    expect(
      Math.hypot(over.position.x - SPAWN_X_M, over.position.z - SPAWN_Z_M),
      'spawn did not land -- this budget would be measured over open water',
    ).toBeLessThan(5000)
    expect(over.groundHeightM ?? 0, 'the aeroplane is over water, not over Leyte').toBeGreaterThan(0)

    await page.waitForTimeout(SETTLE_MS)
    await page.evaluate(() => {
      ;(window as DiagWindow).__ww2!.resetFrameTimes()
    })
    await page.waitForTimeout(WINDOW_MS)

    const times = await page.evaluate(() => ({
      gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
      interval: (window as DiagWindow).__ww2!.frameTimesMs(),
      errors: (window as DiagWindow).__ww2!.validationErrors,
    }))

    // ~500 of each is what a 5 s window at 100 Hz produces; 100 is a floor
    // that says "the loop really ran and really resolved queries" without
    // pinning the test to a frame rate.
    expect(times.gpu.length, 'too few GPU timestamp samples to take a percentile').toBeGreaterThan(100)
    expect(times.interval.length, 'too few frames to take a percentile').toBeGreaterThan(100)

    const gpuP50 = percentile(times.gpu, 0.5)
    const gpuP95 = percentile(times.gpu, 0.95)
    const intervalP95 = percentile(times.interval, 0.95)
    const detail = `gpu p50 ${gpuP50.toFixed(3)} ms, p95 ${gpuP95.toFixed(3)} ms over ${times.gpu.length} samples; rAF interval p95 ${intervalP95.toFixed(3)} ms`

    // Printed on a PASS as well as a failure: this test's output is the
    // measurement, and a budget whose current reading is only visible when it
    // breaks is a budget nobody can see drifting toward its limit.
    console.log(`frame-time budget: ${detail}`)

    expect(gpuP95, detail).toBeLessThanOrEqual(GPU_BUDGET_P95_MS)
    expect(intervalP95, `a frame interval this long is a missed vsync -- ${detail}`).toBeLessThanOrEqual(
      INTERVAL_P95_MS,
    )
    expect(times.errors, `WebGPU validation errors:
${JSON.stringify(times.errors, null, 2)}`).toEqual([])
  })
})
