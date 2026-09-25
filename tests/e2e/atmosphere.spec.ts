import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import {
  MULTI_SCATTERING_LUT_SIZE, multiScatteringLutParams, multipleScatteringPsi, transmittanceToTop, type Rgb,
} from '../../src/render/sky/atmosphere.js'
import { AP_SLICES, AP_SLICE_TEXELS, SKY_VIEW_HEIGHT, skyViewLutUv, type AtmosphereLutName } from '../../src/render/sky/atmosphereLuts.js'

/**
 * Tier 2, the atmosphere LUTs (photoreal Task 8, spec §4.3): the GPU and CPU
 * halves of the one atmosphere model must agree. The transmittance LUT is
 * read back from the GPU at (hM, mu), filtered as a sampler would, and held
 * to `transmittanceToTop` within 2% per channel. A mismatch is a bug in one of
 * the two, never a reason to widen the tolerance. Same console-error guard as
 * clouds.spec.ts: a TSL graph that fails to build renders black silently.
 */
test.setTimeout(120_000)
const consoleErrors: string[] = []
test.beforeEach(({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

const gpuTransmittance = (page: Page, hM: number, mu: number): Promise<Rgb> =>
  page.evaluate(([h, m]) => (window as DiagWindow).__ww2!.atmosphereTransmittance(h!, m!), [hM, mu])
const texel = (page: Page, lut: AtmosphereLutName, px: number, py: number): Promise<readonly number[]> =>
  page.evaluate(([l, x, y]) => (window as DiagWindow).__ww2!.atmosphereLutTexel(l as AtmosphereLutName, x as number, y as number), [lut, px, py] as const)

function expectWithin(gpu: Rgb, cpu: Rgb, tolerance: number, label: string): void {
  for (let c = 0; c < 3; c++) {
    const rel = Math.abs(gpu[c]! / cpu[c]! - 1)
    expect(rel, `${label} channel ${c}: gpu ${gpu[c]} cpu ${cpu[c]}`).toBeLessThanOrEqual(tolerance)
  }
}

test('GPU transmittance LUT matches the CPU model within 2% (runway)', async ({ page }) => {
  await page.goto('/')
  await waitForTerrain(page)
  await page.waitForTimeout(500)
  const cases: readonly (readonly [number, number])[] = [[0, 1], [0, 0.2], [0, 0.02], [3000, 0.5]]
  for (const [hM, mu] of cases) {
    const gpu = await gpuTransmittance(page, hM, mu)
    const cpu = transmittanceToTop(hM, mu)
    console.log(`ATMOSPHERE T h=${hM} mu=${mu} gpu=${gpu.map((v) => v.toPrecision(5)).join(',')} cpu=${cpu.map((v) => v.toPrecision(5)).join(',')}`)
    expectWithin(gpu, cpu, 0.02, `T(h=${hM}, mu=${mu})`)
  }
})

test('multi-scattering LUT matches the CPU Psi_ms; per-frame LUTs are finite and oriented', async ({ page }) => {
  // In the air over the gulf, so the sky-view eye is well above the sea.
  await page.goto(spawnUrl({ x: -29666, y: 1900, z: -55605 }))
  await waitForTerrain(page)
  await page.waitForTimeout(500)
  // Psi_ms at a few texel centers. The CPU marches the sun's transmittance
  // in 32 steps where the GPU samples the transmittance LUT, so these are
  // two different quadratures of one integral.
  const n = MULTI_SCATTERING_LUT_SIZE
  for (const [i, j] of [[31, 0], [24, 0], [20, 3], [28, 10]] as const) {
    const gpu = (await texel(page, 'multiScattering', i, j)).slice(0, 3) as unknown as Rgb
    const p = multiScatteringLutParams((i + 0.5) / n, (j + 0.5) / n)
    const cpu = multipleScatteringPsi(p.hM, p.muS)
    console.log(`ATMOSPHERE PSI h=${p.hM.toFixed(0)} muS=${p.muS.toFixed(3)} gpu=${gpu.map((v) => v.toPrecision(4)).join(',')} cpu=${cpu.map((v) => v.toPrecision(4)).join(',')}`)
    expectWithin(gpu, cpu, 0.02, `Psi(h=${p.hM}, muS=${p.muS})`)
  }
  // Sky-view: the zenith is blue (b > g > r), finite and positive; the row
  // just above the horizon is brighter than the zenith (aerial haze).
  const sun = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
  expect(sun.elevationDeg).toBeGreaterThan(10)
  const eyeY = 1900
  const row = (zenithCos: number) => Math.floor(skyViewLutUv(eyeY, zenithCos, -1)[1] * SKY_VIEW_HEIGHT)
  const zenith = await texel(page, 'skyView', 191, row(1))
  const horizon = await texel(page, 'skyView', 191, row(0.02))
  console.log(`ATMOSPHERE SKY zenith=${zenith.slice(0, 3).map((v) => v.toPrecision(4)).join(',')} nearHorizon=${horizon.slice(0, 3).map((v) => v.toPrecision(4)).join(',')}`)
  for (const v of [...zenith, ...horizon]) expect(Number.isFinite(v)).toBe(true)
  expect(zenith[2]!).toBeGreaterThan(zenith[1]!)
  expect(zenith[1]!).toBeGreaterThan(zenith[0]!)
  expect(zenith[0]!).toBeGreaterThan(0)
  expect(horizon[0]! + horizon[1]! + horizon[2]!).toBeGreaterThan(zenith[0]! + zenith[1]! + zenith[2]!)
  // Aerial perspective: the screen-center texel of each slice; transmittance
  // falls and in-scattered light grows with depth, never NaN.
  const center = AP_SLICE_TEXELS / 2
  let prev: readonly number[] = [0, 0, 0, 1]
  for (const k of [0, 7, 15, 23, 31]) {
    const ap = await texel(page, 'aerialPerspective', k * AP_SLICE_TEXELS + center, center)
    console.log(`ATMOSPHERE AP slice=${k} rgba=${ap.map((v) => v.toPrecision(4)).join(',')}`)
    for (const v of ap) expect(Number.isFinite(v)).toBe(true)
    expect(ap[3]!).toBeLessThanOrEqual(prev[3]!)
    expect(ap[3]!).toBeGreaterThan(0)
    expect(ap[2]!).toBeGreaterThanOrEqual(prev[2]!)
    prev = ap
  }
  expect(AP_SLICES).toBe(32)
})
