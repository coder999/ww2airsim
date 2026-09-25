import { describe, it, expect } from 'vitest'
import {
  MS_A, MS_B, MS_C, MS_OCTAVES, MS_SCALE, beerPowder, dualLobePhase, henyeyGreenstein, multiScatter, powder,
} from '../../src/render/scene/cloudLighting.js'
import { CUMULUS_SIGMA } from '../../src/render/scene/cloudField.js'

/** Midpoint integral of f(cos theta) over the sphere: 2 pi * int_{-1}^{1} f(mu) dmu. */
function sphereIntegral(f: (mu: number) => number, n = 2000): number {
  let sum = 0
  for (let i = 0; i < n; i++) sum += f(-1 + (2 * (i + 0.5)) / n)
  return 2 * Math.PI * sum * (2 / n)
}

describe('cloud lighting (photoreal Task 11, spec 4.4)', () => {
  it('Henyey-Greenstein is normalized over the sphere for back, isotropic and forward g', () => {
    for (const g of [-0.3, 0, 0.8]) {
      expect(sphereIntegral((mu) => henyeyGreenstein(mu, g))).toBeCloseTo(1, 1)
      expect(Math.abs(sphereIntegral((mu) => henyeyGreenstein(mu, g)) - 1)).toBeLessThan(0.01)
    }
    expect(henyeyGreenstein(0.3, 0)).toBeCloseTo(1 / (4 * Math.PI), 12)
  })
  it('the dual lobe peaks toward the sun, keeps a back lobe, and is itself normalized', () => {
    expect(dualLobePhase(1)).toBeGreaterThan(dualLobePhase(0))
    expect(dualLobePhase(0)).toBeGreaterThan(0)
    expect(dualLobePhase(-1)).toBeGreaterThan(dualLobePhase(0))
    expect(Math.abs(sphereIntegral((mu) => dualLobePhase(mu)) - 1)).toBeLessThan(0.01)
    // The octave form flattens the lobes: eccentricity scale 0 is isotropic.
    expect(dualLobePhase(0.9, 0)).toBeCloseTo(1 / (4 * Math.PI), 12)
  })
  it('multiple scattering: falls with shadow depth, never to zero, and the octaves add light where one alone is dark', () => {
    expect([MS_OCTAVES, MS_A, MS_B, MS_C]).toEqual([3, 0.5, 0.5, 0.5])
    for (const c of [-1, -0.2, 0, 0.5, 1]) {
      expect(multiScatter(c, 0)).toBeGreaterThan(multiScatter(c, 10))
      expect(multiScatter(c, 10)).toBeGreaterThan(0)
      const single = dualLobePhase(c) * Math.exp(-10)
      // The point of the octaves: deep in a cloud the higher orders dominate.
      expect(multiScatter(c, 10)).toBeGreaterThan(20 * single)
    }
    // Octave 0 is exactly single scattering.
    const c = 0.3, tau = 2
    let tail = 0
    for (let n = 1; n < MS_OCTAVES; n++) tail += MS_B ** n * dualLobePhase(c, MS_C ** n) * Math.exp(-(MS_A ** n) * tau)
    expect(multiScatter(c, tau)).toBeCloseTo(dualLobePhase(c) * Math.exp(-tau) + tail, 12)
  })
  it('Beer-powder: zero at zero depth, one interior maximum, back to zero with depth', () => {
    expect(beerPowder(0)).toBe(0)
    // The brief said "maximum near 0.35"; the brief's own formula,
    // 2 e^-d (1 - e^-2d), peaks where e^2d = 3, d = ln(3)/2 = 0.549.
    let best = 0, at = 0
    for (let d = 0; d <= 5; d += 0.001) if (beerPowder(d) > best) { best = beerPowder(d); at = d }
    expect(at).toBeCloseTo(Math.log(3) / 2, 2)
    expect(beerPowder(0.2)).toBeLessThan(best)
    expect(beerPowder(40)).toBeLessThan(1e-12)
    expect(beerPowder(1.3)).toBeCloseTo(2 * Math.exp(-1.3) * powder(1.3), 12)
  })
  it('MS_SCALE makes a sunlit cloud top about as bright as a Lambertian surface of albedo 0.8 (the one tuned constant)', () => {
    // A half-space of density 1 below y = 0, sun at the noon default's 68 deg,
    // viewed from above at 30 deg down, at three azimuths to the sun. The
    // march is the one clouds.ts runs: scattered += lit * T * (1 - stepT),
    // lit = MS_SCALE * multiScatter(cos, tau to the sun) * sun irradiance (1),
    // no ambient and no powder (powder is ~1 in a density-1 body).
    const sigma = CUMULUS_SIGMA
    const sunEl = (68 * Math.PI) / 180
    const sun = [Math.cos(sunEl), Math.sin(sunEl), 0] as const
    const viewEl = (-30 * Math.PI) / 180
    const lambert = (0.8 * Math.sin(sunEl)) / Math.PI
    const ratios = [0, 90, 180].map((azDeg) => {
      const az = (azDeg * Math.PI) / 180
      const dir = [Math.cos(viewEl) * Math.cos(az), Math.sin(viewEl), Math.cos(viewEl) * Math.sin(az)] as const
      const cos = dir[0] * sun[0] + dir[1] * sun[1] + dir[2] * sun[2]
      let T = 1, L = 0
      const ds = 2
      for (let t = ds / 2; t < 3000 && T > 1e-4; t += ds) {
        const depth = -dir[1] * t
        const tauSun = (sigma * depth) / sun[1]
        const stepT = Math.exp(-sigma * ds)
        L += MS_SCALE * multiScatter(cos, tauSun) * T * (1 - stepT)
        T *= stepT
      }
      return L / lambert
    })
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    console.log('cloud top vs Lambert 0.8, azimuth 0/90/180:', ratios.map((r) => r.toFixed(3)).join(' '), 'mean', mean.toFixed(3))
    expect(mean).toBeGreaterThan(0.9)
    expect(mean).toBeLessThan(1.1)
  })
})
