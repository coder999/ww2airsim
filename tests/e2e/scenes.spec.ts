import { expect, test } from '@playwright/test'
import type { DiagWindow } from './harness.js'
import { parseScene } from '../../src/sim/scene/schema.js'

/**
 * F9 campaign scenes (plan 2026-10-17). The chapter scenes do not exist yet (F10), so this drives the demo opening on the
 * `escort` scenario through the DEV entry `?scene=` (a quick launch). Correctness only: the scene plays on its own world,
 * Esc skips it, and the flight is then live. Skip-equals-completion is proven headless (tests/render/sceneFlow.test.ts).
 */
test.setTimeout(180_000)

const scene = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2?.scene() ?? null)
const tick = (page: import('@playwright/test').Page) => page.evaluate(() => (window as DiagWindow).__ww2?.tick() ?? 0)

test('the demo opening plays, Esc skips it to the handoff, and the flight resumes', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&scene=demo-opening')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() != null, undefined, { timeout: 90_000 })
  const playing = await scene(page)
  expect(playing?.id).toBe('demo-opening')
  const total = playing!.ticksLeft
  expect(total).toBeGreaterThan(0)
  // the scene is stepping its own world, and the HUD is hidden
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.scene()?.ticksLeft ?? t) < t, total, { timeout: 30_000 })
  await expect(page.locator('#app')).toHaveClass(/replaying/)

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.scene() == null, undefined, { timeout: 10_000 })
  // skip landed at the handoff: the whole pre-roll (15 s = 900 ticks) is behind us, and the flight is live
  const atHandoff = await tick(page)
  expect(atHandoff).toBeGreaterThanOrEqual(900)
  await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) > t + 30, atHandoff, { timeout: 30_000 })
})

test('director mode opens on a scene, drops a key at the scrubbed time, and saves a valid scene', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&director=demo-opening')
  const bar = page.locator('[data-director]')
  await expect(bar).toBeVisible({ timeout: 90_000 })
  const before = await bar.locator('.director-key').count()
  // selecting a key draws from that key's pose (a regression guard: the director's callbacks must reach the frame loop)
  const second = parseScene(JSON.parse(await (await page.request.get('/content/scenes/demo-opening.json')).text()) as unknown).camera[1]!
  await bar.locator('.director-key').nth(1).click()
  await page.waitForFunction(() => (window as DiagWindow).__ww2?.directorEye() != null, undefined, { timeout: 5_000 })
  const eye = await page.evaluate(() => (window as DiagWindow).__ww2!.directorEye())
  expect(eye!.position).toEqual(second.position)
  expect(eye!.yawDeg).toBeCloseTo(second.yawDeg)
  // move the bar to 7.3 s, where the demo has no key, and drop the free camera's view there
  await bar.getByLabel('Scene time in seconds').fill('7.3')
  await bar.getByRole('button', { name: 'Drop key' }).click()
  await expect(bar.locator('.director-key')).toHaveCount(before + 1)
  const download = page.waitForEvent('download')
  await bar.getByRole('button', { name: 'Save' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('demo-opening.json')
  const chunks: Buffer[] = []
  for await (const chunk of await file.createReadStream()) chunks.push(chunk as Buffer)
  const saved = parseScene(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
  expect(saved.camera).toHaveLength(before + 1)
  expect(saved.camera.some((k) => Math.abs(k.t - 7.3) < 1e-3)).toBe(true)
})

test('director mode flies the camera in space even with a bar control focused', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&director=demo-opening')
  const bar = page.locator('[data-director]')
  await expect(bar).toBeVisible({ timeout: 90_000 })
  // focus a bar control: its key handlers stop propagation, which used to starve the free camera of W/A/S/D/Q/E
  await bar.getByRole('button', { name: 'Play preview' }).focus()
  await bar.getByRole('button', { name: 'Play preview' }).click() // starts, then...
  await bar.getByRole('button', { name: 'Pause preview' }).click() // ...pauses: back to editing, button still focused
  const eyeOf = () => page.evaluate(() => (window as DiagWindow).__ww2!.directorEye()!.position)
  const before = await eyeOf()
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyW')
  const after = await eyeOf()
  expect(Math.hypot(after[0] - before[0], after[2] - before[2])).toBeGreaterThan(5)
  await page.keyboard.down('KeyE')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyE')
  expect((await eyeOf())[1]).toBeGreaterThan(after[1] + 3)
})

test('in director mode the wheel dollies the camera along its view, 500 ft a notch', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&director=demo-opening')
  const bar = page.locator('[data-director]')
  await expect(bar).toBeVisible({ timeout: 90_000 })
  await expect(bar).toContainText('Wheel')
  const eyeOf = () => page.evaluate(() => (window as DiagWindow).__ww2!.directorEye()!)
  const before = await eyeOf()
  await page.mouse.move(600, 300)
  await page.mouse.wheel(0, -100) // one notch up: forward
  await page.waitForTimeout(500)
  const after = await eyeOf()
  const moved = Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1], after.position[2] - before.position[2])
  expect(moved).toBeCloseTo(152.4, 0)
  // forward means the way it points: the move lines up with the yaw and pitch
  const dx = after.position[0] - before.position[0]
  const dz = after.position[2] - before.position[2]
  const yaw = before.yawDeg * Math.PI / 180
  expect(dx / moved).toBeCloseTo(Math.cos(before.pitchDeg * Math.PI / 180) * Math.cos(yaw), 1)
  expect(dz / moved).toBeCloseTo(-Math.cos(before.pitchDeg * Math.PI / 180) * Math.sin(yaw), 1)
})

test('in director mode a drag moves the view like a touch screen: right turns it left, up turns it down', async ({ page }) => {
  await page.goto('/?scenario=escort&launch&director=demo-opening')
  const bar = page.locator('[data-director]')
  await expect(bar).toBeVisible({ timeout: 90_000 })
  const eyeOf = () => page.evaluate(() => (window as DiagWindow).__ww2!.directorEye()!)
  const turn = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180
  const before = await eyeOf()
  await page.mouse.move(600, 300)
  await page.mouse.down()
  await page.mouse.move(700, 250, { steps: 5 }) // right and up
  await page.mouse.up()
  await page.waitForTimeout(300)
  const after = await eyeOf()
  expect(turn(before.yawDeg, after.yawDeg)).toBeGreaterThan(0.5) // yaw rises counter-clockwise from above: a turn to the left
  expect(after.pitchDeg).toBeLessThan(before.pitchDeg - 0.5) // looks down
})
