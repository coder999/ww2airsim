import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { loadScenario } from '../../tools/content/load.js'

// B4, the tutorial (docs/superpowers/plans/2026-10-10-b4-tutorial.md): "Basic Flying" launched the way a player
// launches it, then flown with real keys through its first five steps (full throttle, take off, gear up, climb above
// 1,500 ft), with a capture at each transition for a human. A capture tool, not a test: skipped unless
// E2E_CAPTURE=1 (docs/testing.md). Run on the reference GPU. The whole sortie is flown headless
// (tests/sim/mission/missions/tutorial.test.ts); this proves the instructor's lines, the objective line and the steering
// cue reach the screen as the steps complete. The assertions read the wire (`__ww2.mission()`), not the picture.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/tutorial'
test.setTimeout(300_000)

const s = loadScenario('tutorial')
const MESSAGES = s.triggers!.flatMap((t) => t.then.flatMap((a) => ('message' in a ? [a.message] : [])))

const mission = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.mission()!)
const done = async (page: Page): Promise<string[]> =>
  (await mission(page)).log.flatMap((e) => (e.kind === 'objective' && e.status === 'complete' ? [e.id] : []))
const waitDone = (page: Page, id: string, timeout = 60_000) =>
  expect.poll(() => done(page).then((d) => d.includes(id)), { timeout, message: `objective ${id} completes` }).toBe(true)
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png` })

/** Wings level at a steady 10 degree climb to 1,500 ft and a bit more, with real key events (the `deckRun` law, as keys). */
async function climbWithKeys(page: Page, maxS: number): Promise<void> {
  await page.evaluate(async (maxS) => {
    const load = new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>
    const { keysFor } = await load('/tests/pilot/keys.ts') as { keysFor: (...a: unknown[]) => { held: string[]; toggles: string[] } }
    const { attitudeAngles } = await load('/src/sim/flight/attitude.ts') as { attitudeAngles: (s: unknown) => { rollRad: number } }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (window as any).__ww2
    const key = (type: 'keydown' | 'keyup', code: string): void => { window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })) }
    const down = new Set<string>()
    let integral = 0
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const tick = (): void => {
        const log = d.mission()?.log ?? []
        const finished = log.some((e: { kind: string; id?: string; status?: string }) => e.kind === 'objective' && e.id === 'climb' && e.status === 'complete')
        if (finished || (performance.now() - t0) / 1000 > maxS || d.impact() !== null) {
          for (const c of down) key('keyup', c)
          resolve()
          return
        }
        const flight = d.playerFlight()
        const v = flight.state.velocity
        const speed = Math.hypot(v.x, v.y, v.z)
        const gammaDeg = (Math.atan2(v.y, Math.hypot(v.x, v.z)) * 180) / Math.PI
        const error = (speed < 50 ? 0 : 10) - gammaDeg
        integral = Math.max(-0.5, Math.min(1, integral + error / 60 / 40))
        const wanted = {
          pitch: Math.max(-1, Math.min(1, error / 20 + integral)),
          roll: Math.max(-1, Math.min(1, -2 * attitudeAngles(flight.state).rollRad)),
          yaw: 0, throttle: 1,
        }
        const controls = d.controls()
        const k = keysFor(wanted, controls, controls.gearDown === true, controls.flapDown === true)
        const want = new Set(k.held)
        for (const c of [...down]) if (!want.has(c)) { key('keyup', c); down.delete(c) }
        for (const c of want) if (!down.has(c)) { key('keydown', c); down.add(c) }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }, maxS)
}

test('Basic Flying: the first steps, flown with keys, each transition on the wire and on the screen', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(withParams('/', { scenario: 'tutorial', launch: '1', aircraft: 'f6f-hellcat', loadout: 'bombs', cloudTier: 'off', oceanTier: 'high' }))
  await waitForTerrain(page)

  // 1. The welcome call at 1 s, and the throttle step on the objective line.
  await expect.poll(async () => (await mission(page)).radio, { timeout: 15_000 }).toBe(MESSAGES[0])
  expect((await mission(page)).objective).toContain(s.objectives![0]!.label.toUpperCase())
  await shot(page, '01-welcome')

  // 2. Full throttle with the key held; the instructor moves on to the take-off roll.
  await page.keyboard.down('Equal')
  await waitDone(page, 'throttle')
  await expect.poll(async () => (await mission(page)).radio).toBe(MESSAGES[1])
  expect((await mission(page)).objective).toContain('TAKE OFF')
  await shot(page, '02-rolling')

  // 3. Roll, rotate, leave the ground.
  const start = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
  await page.waitForFunction(([x, z]) => {
    const p = (window as DiagWindow).__ww2!.aircraftPositionM()
    return Math.hypot(p.x - x!, p.z - z!) > 380
  }, [start.x, start.z] as const, { timeout: 90_000 })
  await page.keyboard.down('ArrowDown')
  await waitDone(page, 'up', 30_000)
  await page.keyboard.up('ArrowDown')
  await expect.poll(async () => (await mission(page)).radio).toBe(MESSAGES[2])
  expect((await mission(page)).objective).toContain('GEAR UP')
  await shot(page, '03-airborne')

  // 4. Gear up, with the key; held pitch is released and the climb law takes over below.
  await page.keyboard.up('Equal')
  await page.keyboard.press('KeyG')
  await waitDone(page, 'gear-up', 30_000)
  await expect.poll(async () => (await mission(page)).radio).toBe(MESSAGES[3])
  await shot(page, '04-gear-up')

  // 5. Climb above 1,500 ft; then the amber arrow points at the marker.
  await climbWithKeys(page, 90)
  await waitDone(page, 'climb', 5_000)
  await expect.poll(async () => (await mission(page)).radio).toBe(MESSAGES[4])
  const m = await mission(page)
  expect(m.objective).toContain('FLY TO THE MARKER')
  expect(m.steering, 'the steering cue names the marker').toMatch(/marker/i)
  await page.waitForTimeout(500)
  await shot(page, '05-climb-arrow')

  expect(await done(page)).toEqual(['throttle', 'up', 'gear-up', 'climb'])
  expect(errors).toEqual([])
})
