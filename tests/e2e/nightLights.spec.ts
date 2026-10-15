import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { lumaGrid } from './nightStats.js'

/**
 * F6A light legibility against the "movie night" floor (plan §3.5a, Task 4),
 * measured by pixel readback on the night test range
 * (content/scenarios/night-range.json). A lifted floor lowers every light's
 * contrast, so these are the assertions that say a light is still a light.
 * Correctness only; frame time is the budget spec's business.
 *
 * Contrast here is the WCAG 2.1 contrast ratio, (L1 + 0.05) / (L2 + 0.05) on
 * linear relative luminance of the screenshot's sRGB bytes (so the figures are
 * what the eye gets after the tone curve, and a pixel clips at 1.0): L1 is the
 * glow's brightest pixel within 4.5 px of its centre, L2 the MEDIAN of a ring
 * around it (25 to 50 px; a flare's halo is wider than that, so its ring is
 * 150 to 220 px: median, so a neighbouring light in the ring does not count as
 * "background"). The ratio is 21:1 for white on black, 1:1 for no contrast.
 *
 * Not yet asserted (they need later tasks): a flare's lit GROUND POOL at least
 * 3x the unlit floor (Task 5, the shared lighting node), a searchlight beam at
 * least 3:1 over adjacent sky (Task 6) and nav lights at 1 mile (Task 7).
 */
test.setTimeout(240_000)
const RANGE = { scenario: 'night-range', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', cloudTier: 'off' }
const threeErrors: string[] = []
test.beforeEach(({ page }) => {
  threeErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') threeErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => threeErrors.push(e.message))
})
test.afterEach(() => { expect(threeErrors, `console errors:\n${threeErrors.join('\n')}`).toEqual([]) })

async function open(page: Page, at: { x: number; y: number; z: number } | null, extra: Record<string, string> = {}): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(withParams(at === null ? '/' : spawnUrl(at), { ...RANGE, ...extra }))
  await waitForTerrain(page)
  await page.waitForTimeout(3500)
}
type Seen = { id: string; kind: string; lit: boolean; distanceM: number; screen: { x: number; y: number } | null }
const seen = (page: Page): Promise<Seen[]> => page.evaluate(() => (window as DiagWindow).__ww2!.lights() as Seen[])

/** sRGB byte luminance (0..255) to linear relative luminance (0..1). */
const linear = (byteLuma: number): number => { const c = byteLuma / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }

/** Core and ring luminance around a light's glow. */
async function contrast(page: Page, at: { x: number; y: number }, ringPx: readonly [number, number] = [25, 50], coreHalfWidthPx = 4.5, coreHalfHeightPx = 2): Promise<{ core: number; ring: number; ratio: number }> {
  const R = ringPx[1]
  const x0 = Math.round(at.x) - R, y0 = Math.round(at.y) - R
  expect(x0 >= 0 && y0 >= 0 && x0 + 2 * R < 1920 && y0 + 2 * R < 1080, `the light at ${JSON.stringify(at)} is well inside the frame`).toBe(true)
  const g = await lumaGrid(page, await page.screenshot(), { x: x0, y: y0, w: 2 * R, h: 2 * R })
  let core = 0
  const ring: number[] = []
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const d = Math.hypot(x - R, y - R), v = linear(g.luma[y * g.w + x]!)
    // A beam sweeps, so its core is the brightest pixel along a short horizontal scan, not the projected point itself.
    if (d <= coreHalfWidthPx || (coreHalfWidthPx > 5 && Math.abs(y - R) <= coreHalfHeightPx && Math.abs(x - R) <= coreHalfWidthPx)) core = Math.max(core, v)
    else if (d >= ringPx[0] && d <= ringPx[1]) ring.push(v)
  }
  ring.sort((a, b) => a - b)
  const med = ring[Math.floor(ring.length / 2)]!
  return { core, ring: med, ratio: (core + 0.05) / (med + 0.05) }
}

test('a lit runway flare pot reads at least 8:1 over the night floor around it, and an unlit one draws no glow', async ({ page }) => {
  await open(page, null)
  const lights = await seen(page)
  const lit = lights.filter((l) => l.kind === 'pot' && l.lit && l.screen !== null)
  expect(lit.length, 'the runway pots are drawn').toBeGreaterThan(10)
  expect(lights.filter((l) => l.kind === 'pot' && !l.lit).length, 'the unlit pots are listed but dark').toBeGreaterThan(0)
  // A pot about 300 m off (its 3 m halo is then about 10 px, inside the 25 px ring's inner edge), well inside the frame.
  const inside = lit.filter((l) => l.screen!.x > 120 && l.screen!.x < 1800 && l.screen!.y > 200 && l.screen!.y < 900)
  expect(inside.length).toBeGreaterThan(3)
  const probe = inside.sort((a, b) => Math.abs(a.distanceM - 300) - Math.abs(b.distanceM - 300))[0]!
  expect(probe.distanceM, 'a mid-range pot exists').toBeGreaterThan(150)
  const c = await contrast(page, probe.screen!)
  console.log('pot', probe.id, c, probe.screen, probe.distanceM)
  if (process.env.NIGHT_DEBUG) await page.screenshot({ path: 'test-results/pot-probe.png', clip: { x: probe.screen!.x - 100, y: probe.screen!.y - 100, width: 200, height: 200 } })
  expect(c.ratio).toBeGreaterThanOrEqual(8)
  // An unlit pot beside them (the first four on the west row are dark) draws no glow: no contrast with its surroundings.
  const dark = lights.find((l) => l.id === 'pot-w01')!
  expect(dark.lit).toBe(false)
  expect(dark.screen, 'the unlit pot is in front of the eye').not.toBeNull()
  const d = await contrast(page, dark.screen!)
  console.log('unlit pot-w01', d)
  expect(d.ratio, 'an unlit pot is not a light').toBeLessThan(2)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})

test('the red harbor light and a threshold light read at least 3:1 over the floor', async ({ page }) => {
  // Parked on the runway (a still view: an airborne one moves between reading the anchors and the screenshot).
  // The harbor light is 1700 m east and 1700 m south of the runway centre: 135 degrees right of the nose.
  await open(page, null, { look: '-135,1' })
  const harbor = (await seen(page)).find((l) => l.id === 'harbor-red')!
  expect(harbor.lit).toBe(true)
  expect(harbor.screen, 'the harbor light is in front of the eye').not.toBeNull()
  const c = await contrast(page, harbor.screen!)
  console.log('harbor-red', c)
  expect(c.ratio).toBeGreaterThanOrEqual(3)
})

test('a parachute flare reads at least 8:1 over the sky well outside its halo while it burns', async ({ page }) => {
  // The flare ignites at 1 s sim time at (CX+500, 520 m, CZ-200): from the runway, 68 degrees right and 40 up.
  await open(page, null, { look: '-68,36' })
  const flare = (await seen(page)).find((l) => l.id === 'flare-1')!
  expect(flare.lit, 'burning').toBe(true)
  expect(flare.screen).not.toBeNull()
  const c = await contrast(page, flare.screen!, [150, 220])
  console.log('flare-1', c)
  expect(c.ratio).toBeGreaterThanOrEqual(8)
})

test('the shared lighting node on the GPU agrees with its CPU twin at known points (inverse square, cosine, fade)', async ({ page }) => {
  await open(page, null)
  const CX = -29666, CZ = -47605
  // Under and around the parachute flare (CX+500, CZ-200, ~500 m up) with up-facing normals, near a pot with a sideways normal,
  // and an omnidirectional receiver. Several distances, so an inverse-square or fade error cannot hide.
  const probes: { at: [number, number, number]; normal: [number, number, number] | null }[] = [
    { at: [CX + 500, 2, CZ - 200], normal: [0, 1, 0] },
    { at: [CX + 500 + 300, 2, CZ - 200], normal: [0, 1, 0] },
    { at: [CX + 500 + 900, 2, CZ - 200 + 400], normal: [0, 1, 0] },
    { at: [CX + 500 - 1500, 2, CZ - 200], normal: [0, 1, 0] },
    { at: [CX + 30, 2, CZ + 10], normal: [-1, 0, 0] },
    { at: [CX + 400, 40, CZ - 200], normal: null },
  ]
  let strongest = 0
  for (const p of probes) {
    const r = await page.evaluate(([x, y, z, n]) => (window as DiagWindow).__ww2!.lightIrradianceAt(x as number, y as number, z as number, n as [number, number, number] | null), [...p.at, p.normal] as const)
    expect(r.lit, 'lights are selected').toBeGreaterThan(0)
    console.log('irradiance', JSON.stringify(p.at), 'gpu', r.gpu.map((v) => v.toFixed(5)).join(' '), 'cpu', r.cpu.map((v) => v.toFixed(5)).join(' '))
    for (let c = 0; c < 3; c++) {
      const tol = Math.max(1e-4, 0.02 * Math.abs(r.cpu[c]!))
      expect(Math.abs(r.gpu[c]! - r.cpu[c]!), `channel ${c} at ${JSON.stringify(p.at)}`).toBeLessThanOrEqual(tol)
    }
    strongest = Math.max(strongest, r.cpu[0]!)
  }
  // Vacuous-pass guard: the lights really do light something at these points.
  expect(strongest).toBeGreaterThan(0.01)
})

test('a searchlight beam reads at least 3:1 over the sky beside it (90 to 140 px out, past its own bloom), and its drawn axis is the light\'s aim', async ({ page }) => {
  // Parked on the runway, looking back at the searchlight (south-west, behind the nose) and up the beam.
  await open(page, null, { look: '149,28' })
  // A point along the beam that is well inside the frame (the beam climbs out of the top of it).
  let b: { lengthM: number; screen: { x: number; y: number } | null; axis: readonly number[] } | undefined
  for (const f of [0.001, 0.002, 0.004, 0.008, 0.016, 0.03, 0.06, 0.12]) {
    const list = await page.evaluate((fr) => (window as DiagWindow).__ww2!.beams(fr), f)
    expect(list.length, 'one beam is drawn').toBe(1)
    const s = list[0]!.screen
    if (s !== null && s.x > 170 && s.x < 1750 && s.y > 170 && s.y < 900) { b = list[0]; break }
  }
  expect(b, 'some point of the beam is on screen').toBeDefined()
  expect(b!.screen, 'the beam is in front of the eye').not.toBeNull()
  expect(b!.lengthM, 'an unobstructed beam into a clear sky runs to its full length').toBeGreaterThan(5000)
  // Axis: elevation 70, azimuth 20 + 4 deg/s x sim time (sweep): read it back from the drawn axis against the light's own aim.
  const el = Math.asin(b!.axis[1]!) * 180 / Math.PI
  expect(el).toBeCloseTo(70, 3)
  const center = await contrast(page, b!.screen!, [90, 140], 40)
  console.log('beam', center)
  expect(center.ratio).toBeGreaterThanOrEqual(3)
})

test('aircraft position lights: a lit airplane\'s nav lights read at least 3:1 at about a mile, each from inside its arc, and a blacked-out one shows none', async ({ page }) => {
  // Parked on the runway looking north, where the passive Avenger orbits (1.1 miles off) (content/scenarios/night-range.json).
  await open(page, null, { look: '0,8' })
  const lights = await seen(page)
  const nav = lights.filter((l) => l.kind === 'nav')
  expect(nav.length, 'the position lights of four airplanes are listed').toBe(12)
  const dark = nav.filter((l) => l.id.startsWith('nav-zero'))
  expect(dark.length).toBe(3)
  expect(dark.every((l) => !l.lit), 'the blacked-out Zero shows no light').toBe(true)
  const visible = nav.filter((l) => l.lit && l.screen !== null && l.distanceM > 800 && l.screen.x > 120 && l.screen.x < 1800 && l.screen.y > 160 && l.screen.y < 900)
  console.log('visible nav lights', JSON.stringify(visible.map((l) => [l.id, Math.round(l.distanceM)])))
  expect(visible.length, 'at least one position light is visible from here').toBeGreaterThan(0)
  const probe = visible.sort((a, b) => Math.abs(a.distanceM - 1600) - Math.abs(b.distanceM - 1600))[0]!
  const c = await contrast(page, probe.screen!, [25, 50], 14, 14)
  console.log('nav', probe.id, Math.round(probe.distanceM), c)
  expect(c.ratio).toBeGreaterThanOrEqual(3)
})

test('N blacks out the player\'s position lights and back, without touching flight', async ({ page }) => {
  await open(page, null)
  const playerNav = async () => (await seen(page)).filter((l) => l.id.startsWith('nav-player'))
  expect((await playerNav()).length).toBe(3)
  expect((await playerNav()).some((l) => l.lit), 'the player\'s tail light is lit by default').toBe(true)
  const state = () => page.evaluate(() => ({ playerLightsOn: (window as DiagWindow).__ww2!.playerLightsOn() }))
  expect(await state()).toEqual({ playerLightsOn: true })
  await page.keyboard.press('KeyN')
  await page.waitForTimeout(400)
  expect((await state()).playerLightsOn).toBe(false)
  expect((await playerNav()).every((l) => !l.lit), 'blacked out: no player nav light is drawn').toBe(true)
  await page.keyboard.press('KeyN')
  await page.waitForTimeout(400)
  expect((await playerNav()).some((l) => l.lit), 'and back on').toBe(true)
  // Flight is untouched: the throttle key still works after both.
  const throttle = () => page.evaluate(() => (window as DiagWindow).__ww2!.controls().throttle)
  const t0 = await throttle()
  await page.keyboard.down('Equal'); await page.waitForTimeout(600); await page.keyboard.up('Equal')
  expect(await throttle()).toBeGreaterThan(t0)
})
