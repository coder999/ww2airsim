import { test, expect } from '@playwright/test'

/** What main.ts publishes on window.__ww2 in a dev build (src/render/main.ts).
 *  Typed here rather than reached through `any`: the project forbids `any`,
 *  and the lint step in `npm run verify` covers tests/. `cameraMode` is not
 *  part of the original sketch for this hook -- it was added so this file can
 *  prove the sweep below actually drove the app (see the second test's first
 *  block) rather than trusting an empty `validationErrors` that a wrong key
 *  code, or too short a wait, would produce just as easily as a correct
 *  sweep would. */
type Diagnostics = {
  adapter: { severity: 'ok' | 'warn' | 'fail'; summary: string }
  validationErrors: readonly string[]
  tick: () => number
  cameraMode: () => 'chase' | 'cockpit'
}
type DiagWindow = Window & { __ww2?: Diagnostics }

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

  // Fly the rest of the scripted sweep: look-around in each direction, back
  // to the original camera mode, full control deflection. Catches a large
  // class of renderer bugs with no screenshots and no judgement.
  for (const key of ['Numpad4', 'Numpad6', 'Numpad8', 'Numpad2', 'Numpad5', 'KeyC']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(400)
    await page.keyboard.up(key)
  }
  for (const key of ['ArrowDown', 'ArrowLeft', 'ShiftLeft']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(600)
    await page.keyboard.up(key)
  }

  // The render loop must still have been advancing throughout -- if it had
  // stalled or thrown partway through the sweep, validationErrors below would
  // be trivially empty for the wrong reason (nothing ran), the same failure
  // mode the KeyC check above guards against for input specifically.
  const tickAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  expect(tickAfter, 'tick did not advance during the sweep -- the render loop stalled').toBeGreaterThan(
    tickBeforeRest,
  )

  const errors = await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
  expect(errors, `WebGPU validation errors:
${JSON.stringify(errors, null, 2)}`).toEqual([])
})
