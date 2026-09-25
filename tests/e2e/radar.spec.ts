import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { radarBrightness } from '../../src/render/radar.js'
import { TRAIL_DIM } from '../../src/render/scene/radarScope.js'

/**
 * Tier 2, Plan 17 radar scope. Same platform and caveats as
 * `ai-pursuit.spec.ts`: the reference GPU on the Windows desktop, never
 * hosted CI.
 *
 * What only this tier can prove: the offscreen render-target pass actually
 * runs in the shipped app and paints the pixel the pure math in
 * `radar.ts`/`radarScope.ts` predicts (via `radarPixelAt`, not a
 * screenshot -- the cloud-shadow-mirroring lesson), `Tab` reaching the
 * selected range through the real keyboard path, and that the sweep angle
 * genuinely freezes on pause rather than jumping ahead by the paused
 * wall-clock duration.
 */
// 2026-09-25: pursuit-range now spawns pursuer-1 2.5 km ahead (1.55 mi), a
// head-on merge, not ~500 m astern; headless it closes inside 1 mi after
// 3.67 s, passes within 16 m at 10.4 s and is back beyond 1 mi at 17.25 s
// (sim time, passive player). The 1 mi ring check below needs the contact
// inside the ring when it pauses -- re-run on the reference GPU to confirm
// it lands in that window.
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(120_000)

const radar = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.radar()!)

test('the scope shows the contact where the math predicts, Tab cycles range, sweep freezes on pause, budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const initial = await radar(page)
  expect(initial.rangeMi).toBe(15)
  expect(initial.contacts.some((c) => c.id === 'pursuer-1')).toBe(true)

  // Tab through the real keyboard path: 15 -> 5 -> 1.
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(5)
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(1)

  // Pause here, on the 1 mi ring, for the pixel-placement check below.
  // Two reasons to do both at once: pausing freezes the sweep, which is
  // the pause-freeze claim itself, AND it keeps `paused.sweepRad` (read
  // once, below, as JS state) in sync with what the render target actually
  // has painted by the time the async pixel readback resolves -- without
  // pausing, the live sweep could advance between capturing `sweepRad` and
  // the GPU readback landing, making the analytic expected-trail
  // computation below (which is keyed to that exact `sweepRad`) stale by
  // the time it is compared against. The 1 mi ring matters for a second
  // reason (final whole-branch review): the pre-fix doubled-uv-flip bug
  // displaces a read by 2*|cos(bearing)|*(rangeMi/selectedRangeMi) in
  // normalized units. At the DEFAULT 15 mi ring, pursuit-range's old ~500 m
  // initial spawn keeps that displacement small enough to still fall
  // inside the shader's DOT_RADIUS, so a mirrored read could still catch
  // some of the dot's own brightness -- this check would have had only a
  // coin-flip's chance of catching that exact regression at test start. At
  // 1 mi the same contact's range is a large enough fraction of the ring
  // that the displacement clears DOT_RADIUS regardless of exactly how
  // close the contact has closed by the time this runs -- asserted
  // directly below, not trusted.
  await page.keyboard.press('Escape')
  const paused = await radar(page)
  const contact = paused.contacts.find((c) => c.id === 'pursuer-1')!

  // Read back the actual rendered pixel at the live contact's own reported
  // bearing/range, not a value this spec computed independently -- the
  // claim under test is "the shader painted what radar.ts says", not a
  // second, parallel derivation of the geometry.
  //
  // A raw brightness threshold is NOT enough here (task review, round 1):
  // the ambient sweep trail alone reaches RADAR_FADE_FLOOR * TRAIL_DIM
  // (0.12 * 0.55 = 0.066) at EVERY point inside the circle, contact or
  // not. Compare instead against the EXPECTED ambient trail at this exact
  // bearing -- computed analytically via `radarBrightness` (the pure
  // function Tier 1 already proves correct, `tests/render/radar.test.ts`)
  // times `TRAIL_DIM` (the shader's own constant, imported rather than
  // duplicated) -- not a second empirical pixel read.
  //
  // An earlier version of this fix read a second live pixel at the SAME
  // bearing but a range outside `DOT_RADIUS`, comparing the two readings'
  // ratio (both meant to share the identical `brightnessOf(bearing)` term,
  // cancelling in the ratio). Measured on the actual reference GPU (final
  // fix pass, 2026-09-23): that second read is NOT reliably pure trail --
  // `brightnessOf` has a hard discontinuity at zero lag (the sweep's own
  // leading edge jumps from ~1.0 to the ~0.12 floor), and the SECOND
  // fragment's own angle (recomputed by the GPU from ITS texel position,
  // not the exact `bearingRad` float the dot's own brightness uses) can
  // land on either side of that cliff depending on sub-texel quantization
  // -- occasionally reading far brighter than true ambient trail whenever
  // the pause happened to land the sweep close to this bearing. Observed
  // failure rate across 8 live runs: 3/8, with the ratio compressing from
  // ~1.8x to ~1.18x exactly when the control reading spiked -- a REAL,
  // GPU-measured flake, not a hypothesis. Comparing against the analytic
  // baseline instead removes that second, independently-unstable read
  // entirely; the live pixel read this assertion still depends on --
  // `atContact`, at the contact's own exact (bearing, range) -- catches a
  // reintroduced double-flip in most runs, since a mirrored read lands at
  // the reflected bearing pi - bearingRad, not the true one, and that
  // bearing's own brightness generally differs from the true bearing's.
  // NOT airtight, though (whole-branch review, round 2): the reflected
  // bearing's lag from the sweep is a FIXED offset from the true bearing's
  // own lag, so for the narrow arc of `sweepRad` where the true bearing
  // sits near the floor (making the 1.3x threshold very low) while the
  // reflected one sits near the sweep's peak, a mirrored read could still
  // clear this threshold with no dot present -- a real, if narrower and
  // differently-shaped, residual gap from the one this redesign closed.
  // The deterministic backstop against this whole bug class either way is
  // `tests/render/radarScope.test.ts`'s headless, GPU-free orientation
  // invariants on `scopeTexelFor` -- pure math, unaffected by sweep timing,
  // and the ledger records why a live-pixel Tier 2 check exists alongside
  // it anyway (proving the whole pipeline, not just the placement math).
  const displacementFromDoubleFlip = 2 * Math.abs(Math.cos(contact.bearingRad)) * (contact.rangeMi / paused.rangeMi)
  expect(
    displacementFromDoubleFlip,
    'the contact is too close to the ring centre for this check to distinguish a correct readback from a mirrored one',
  ).toBeGreaterThan(0.1)
  const expectedTrailAtBearing = radarBrightness(contact.bearingRad, paused.sweepRad) * TRAIL_DIM
  const atContact = await page.evaluate(
    ([b, r]) => (window as DiagWindow).__ww2!.radarPixelAt(b, r),
    [contact.bearingRad, contact.rangeMi] as const,
  )
  expect(atContact, 'no pixel painted at the contact\'s own reported bearing/range').not.toBeNull()
  expect(
    atContact!,
    `contact reading ${atContact} is not brighter than this bearing's expected ambient trail ${expectedTrailAtBearing} -- the dot is not where the math says it is`,
  ).toBeGreaterThan(expectedTrailAtBearing * 1.3)

  // Sweep is frozen exactly, not just close, while paused.
  await page.waitForTimeout(1000)
  const stillPaused = await radar(page)
  expect(stillPaused.sweepRad).toBe(paused.sweepRad)
  await page.keyboard.press('Escape')
  await expect.poll(() => radar(page).then((r) => r.sweepRad)).not.toBe(paused.sweepRad)

  // Tab still works after a pause cycle, completing the wrap back to 15.
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(15)

  await page.screenshot({ path: 'test-results/radar-scope.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`radar scope: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
