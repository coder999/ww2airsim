import { test, expect } from '@playwright/test'
import type { Ww2Diagnostics } from '../../src/render/diagnostics.js'

/** `window.__ww2` in a dev build (src/render/diagnostics.ts, main.ts). One
 *  shared type with the app rather than a copy declared here: Task 15 review,
 *  round 1 found that two independent copies typecheck clean even when a
 *  field is renamed or dropped on one side, failing only at runtime -- on the
 *  one machine here that cannot run it. */
type DiagWindow = Window & { __ww2?: Ww2Diagnostics }

/**
 * Tier 2. Requires a real GPU, so it runs on the Windows reference platform
 * against a dev server on nexus -- never in hosted CI, which has no GPU.
 *
 * These two checks are here because they need a GPU and need NO human
 * judgement. Screenshot goldens are deliberately excluded: at a stage where the
 * picture changes every commit they generate constant diffs that mean nothing,
 * and they are the expensive half to maintain.
 */
test('the adapter is the reference GPU, not a software rasterizer', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.adapter !== undefined)
  const verdict = await page.evaluate(() => (window as DiagWindow).__ww2!.adapter)
  // Fatal here, unlike in the app, where an unrecognised GPU only warns: this
  // is where a silent fallback would corrupt every frame-time number.
  // Deliberately `.toBe('ok')`, not `!== 'fail'` or any looser form: a `warn`
  // verdict (a bare "WARP" or Mesa's "lavapipe" string that judgeAdapter does
  // not yet recognise as software, Task 7's recorded gap) must still fail
  // this check, or that gap stops being caught by anything.
  expect(verdict.severity, verdict.summary).toBe('ok')
})

test('a camera sweep produces zero WebGPU validation errors', async ({ page }) => {
  await page.goto('/')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 5)

  const initialMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())

  // Press the camera-cycle key on its own first, and confirm it actually
  // changed the app's camera mode, before trusting anything the rest of the
  // sweep does not itself check. Without this, a wrong key code below would
  // report zero errors because nothing happened, not because nothing went
  // wrong -- indistinguishable from a passing run by looking at
  // validationErrors alone.
  await page.keyboard.down('KeyC')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyC')
  await page.waitForFunction(
    (prevMode) => (window as DiagWindow).__ww2!.cameraMode() !== prevMode,
    initialMode,
  )
  const cycledMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())
  expect(cycledMode, 'KeyC did not change window.__ww2.cameraMode() -- see src/input/bindings.ts').not.toBe(
    initialMode,
  )

  const tickBeforeRest = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())

  // Look around, full sweep including the 180-degree look-back (Numpad0) --
  // the most extreme camera pose the app can generate and the likeliest to
  // surface a renderer bug (round 1 review; the omission was the brief's, not
  // just this file's). `lookOffsetFromKeys` is a pure snapshot that snaps
  // back to centre the instant a key is released (src/input/lookAround.ts),
  // so proving the FIRST one took effect has to happen while it is still
  // held -- reading `look()` after the whole loop would read LOOK_CENTRE
  // regardless of whether anything worked, the same trap the KeyC check
  // above avoids for the camera mode.
  await page.keyboard.down('Numpad4')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.look().yawRad !== 0)
  const lookedYaw = await page.evaluate(() => (window as DiagWindow).__ww2!.look().yawRad)
  expect(
    lookedYaw,
    'Numpad4 did not change window.__ww2.look().yawRad -- see src/input/lookAround.ts',
  ).not.toBe(0)
  await page.waitForTimeout(400)
  await page.keyboard.up('Numpad4')

  for (const key of ['Numpad6', 'Numpad8', 'Numpad2', 'Numpad0', 'Numpad5', 'KeyC']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(400)
    await page.keyboard.up(key)
  }
  for (const key of ['ArrowDown', 'ArrowLeft', 'ShiftLeft']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(600)
    await page.keyboard.up(key)
  }

  // Throttle integrates its key and holds after release (controlsFromKeys,
  // src/input/keyboard.ts), so this proves the ShiftLeft hold above actually
  // reached `frame.controls` -- not just that the render loop kept ticking.
  // Round 1 review: `tick()` alone advances from `requestAnimationFrame`
  // whether or not a single key was ever delivered, so it cannot stand in
  // for this; it was the whole control-deflection phase that was unproven.
  const throttleAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.controls().throttle)
  expect(throttleAfter, 'throttle stayed at 0 -- ShiftLeft did not reach frame.controls').toBeGreaterThan(0)

  // The render loop must still have been advancing throughout -- if it had
  // stalled or thrown partway through the sweep, validationErrors below would
  // be trivially empty for the wrong reason (nothing ran).
  const tickAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  expect(tickAfter, 'tick did not advance during the sweep -- the render loop stalled').toBeGreaterThan(
    tickBeforeRest,
  )

  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:
${JSON.stringify(errors, null, 2)}`).toEqual([])
})
