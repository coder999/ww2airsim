import { describe, expect, it } from 'vitest'
import {
  ATMOSPHERE, TRANSMITTANCE_LUT_HEIGHT, TRANSMITTANCE_LUT_WIDTH, cornetteShanksPhase, distanceToTopBoundary,
  extinctionAt, multipleScatteringPsi, multiScatteringLutParams, multiScatteringLutUv, rayIntersectsGround,
  rayleighPhase, skyIrradiance, sunColorAt, transmittanceLutParams, transmittanceLutUv, transmittanceToTop,
} from '../../src/render/sky/atmosphere.js'

const finite = (c: readonly number[]): boolean => c.every(Number.isFinite)

describe('extinctionAt', () => {
  it('at sea level is Rayleigh + Mie (scattering + absorption), and the ozone tent is zero', () => {
    const e = extinctionAt(0)
    const mie = ATMOSPHERE.mieScattering + ATMOSPHERE.mieAbsorption
    expect(e[0]).toBeCloseTo(5.802e-6 + 8.396e-6, 8)
    for (let c = 0; c < 3; c++) expect(e[c]).toBeCloseTo(ATMOSPHERE.rayleighScattering[c]! + mie, 12)
  })
  it('at the ozone peak (25 km) carries the full ozone coefficient', () => {
    const e = extinctionAt(25_000)
    const r = Math.exp(-25_000 / 8000), m = Math.exp(-25_000 / 1200)
    for (let c = 0; c < 3; c++) {
      const want = ATMOSPHERE.rayleighScattering[c]! * r + 8.396e-6 * m + ATMOSPHERE.ozoneAbsorption[c]!
      expect(e[c]).toBeCloseTo(want, 12)
    }
  })
})

describe('transmittanceToTop', () => {
  it('matches the sea-level zenith values for these coefficients', () => {
    // Reference: zenith optical depth = sum of beta * H (the 100 km top cuts
    // off exp(-12.5) of Rayleigh, negligible) plus the ozone tent's area
    // (peak * half-width): red 0.0464 + 0.0101 + 0.0098 = 0.0663 -> 0.936,
    // green 0.1085 + 0.0101 + 0.0282 = 0.1468 -> 0.863, blue 0.2648 + 0.0101
    // + 0.0013 = 0.2762 -> 0.759. The plan's ranges (red 0.90-0.93, blue
    // 0.68-0.74) excluded that exact answer, so red and blue are re-centered on
    // it; the ranges stay loose because their job is catching km-vs-m errors.
    const t = transmittanceToTop(0, 1)
    expect(t[0]).toBeGreaterThan(0.92); expect(t[0]).toBeLessThan(0.95)
    expect(t[1]).toBeGreaterThan(0.83); expect(t[1]).toBeLessThan(0.87)
    expect(t[2]).toBeGreaterThan(0.74); expect(t[2]).toBeLessThan(0.78)
    const tau = [0.0663, 0.1468, 0.2762]
    for (let c = 0; c < 3; c++) expect(t[c]).toBeCloseTo(Math.exp(-tau[c]!), 3)
  })
  it('decreases as the ray tilts from zenith toward the horizon', () => {
    let prev = transmittanceToTop(0, 1)
    for (const mu of [0.8, 0.6, 0.4, 0.2, 0.1, 0.05]) {
      const t = transmittanceToTop(0, mu)
      for (let c = 0; c < 3; c++) expect(t[c]).toBeLessThan(prev[c]!)
      prev = t
    }
  })
  it('is zero for a ray that hits the ground', () => {
    expect(transmittanceToTop(0, -0.1)).toEqual([0, 0, 0])
    expect(rayIntersectsGround(ATMOSPHERE.bottomRadiusM + 3000, -0.5)).toBe(true)
    // From 3 km the geometric horizon dips about 1.76 degrees, so a ray 1 degree down clears the ground.
    expect(rayIntersectsGround(ATMOSPHERE.bottomRadiusM + 3000, Math.sin(-1 * Math.PI / 180))).toBe(false)
    expect(transmittanceToTop(3000, Math.sin(-1 * Math.PI / 180))[0]).toBeGreaterThan(0)
  })
  it('has converged at the default 64 samples (within 1% of 1024) down to mu = 0.05', () => {
    for (const mu of [1, 0.3, 0.05]) {
      const a = transmittanceToTop(0, mu), b = transmittanceToTop(0, mu, 1024)
      for (let c = 0; c < 3; c++) expect(Math.abs(a[c]! / b[c]! - 1)).toBeLessThan(0.01)
    }
  })
  it('rises with altitude', () => {
    const lo = transmittanceToTop(0, 0.5), hi = transmittanceToTop(5000, 0.5)
    for (let c = 0; c < 3; c++) expect(hi[c]).toBeGreaterThan(lo[c]!)
  })
})

describe('ray geometry', () => {
  it('distance to the top boundary is the shell thickness straight up', () => {
    expect(distanceToTopBoundary(ATMOSPHERE.bottomRadiusM, 1)).toBeCloseTo(100_000, 3)
    expect(distanceToTopBoundary(ATMOSPHERE.bottomRadiusM, 0))
      .toBeCloseTo(Math.sqrt(ATMOSPHERE.topRadiusM ** 2 - ATMOSPHERE.bottomRadiusM ** 2), 3)
  })
})

describe('phase functions', () => {
  function integrate(p: (c: number) => number): number {
    const n = 4000
    let s = 0
    for (let i = 0; i < n; i++) s += p(-1 + (2 * (i + 0.5)) / n) * (2 / n)
    return s * 2 * Math.PI
  }
  it('both integrate to 1 over the sphere', () => {
    expect(integrate(rayleighPhase)).toBeCloseTo(1, 4)
    expect(integrate((c) => cornetteShanksPhase(c, ATMOSPHERE.mieG))).toBeCloseTo(1, 2)
  })
  it('Mie with g = 0.8 is strongly forward-peaked', () => {
    expect(cornetteShanksPhase(1, 0.8)).toBeGreaterThan(50 * cornetteShanksPhase(-1, 0.8))
  })
})

describe('sunColorAt', () => {
  it('is whitest overhead, with red > green > blue', () => {
    const s = sunColorAt(0, 90)
    expect(s[0]).toBeGreaterThan(s[1]); expect(s[1]).toBeGreaterThan(s[2])
    expect(s).toEqual(transmittanceToTop(0, 1))
  })
  it('reddens near the horizon', () => {
    const s = sunColorAt(0, 2)
    expect(s[0] / s[2]).toBeGreaterThan(3)
  })
  it('fades smoothly and finitely below the horizon (dusk floor -6 degrees)', () => {
    const at2 = sunColorAt(0, 2), at6 = sunColorAt(0, -6)
    expect(finite(at6)).toBe(true)
    for (let c = 0; c < 3; c++) expect(at6[c]).toBeLessThanOrEqual(at2[c]!)
    // Continuous through the horizon, monotonic down to the floor, never NaN.
    let prev = sunColorAt(0, 1)
    for (let e = 0.75; e >= -8; e -= 0.25) {
      const s = sunColorAt(0, e)
      expect(finite(s)).toBe(true)
      for (let c = 0; c < 3; c++) {
        expect(s[c]).toBeGreaterThanOrEqual(0)
        expect(s[c]).toBeLessThanOrEqual(prev[c]! * 1.0000001)
      }
      prev = s
    }
    const justAbove = sunColorAt(0, 0.001), justBelow = sunColorAt(0, -0.001)
    expect(Math.abs(justAbove[0] - justBelow[0])).toBeLessThan(0.01 * justAbove[0])
  })
  it('a plane at 3 km still sees the sun 1 degree below the sea-level horizon', () => {
    expect(sunColorAt(3000, -1)[0]).toBeGreaterThan(sunColorAt(0, -1)[0])
  })
})

describe('multiple scattering (Hillaire 2020 Psi_ms)', () => {
  it('is positive, finite, and blue-dominant with the sun up', () => {
    const psi = multipleScatteringPsi(0, Math.sin(45 * Math.PI / 180))
    expect(finite(psi)).toBe(true)
    expect(psi[2]).toBeGreaterThan(psi[0])
    for (const c of psi) expect(c).toBeGreaterThan(0)
  })
  it('stays finite with the sun below the horizon', () => {
    expect(finite(multipleScatteringPsi(0, Math.sin(-6 * Math.PI / 180)))).toBe(true)
  })
})

describe('skyIrradiance', () => {
  it('the sky is blue', () => {
    const { up } = skyIrradiance(0, 45)
    expect(up[2]).toBeGreaterThan(up[0])
  })
  it('down is the ground bounce: albedo x (direct sun + up), below what the ground receives', () => {
    // The plan asked for down < up componentwise, which its own formula cannot
    // meet with the sun up: at 45 deg the ground receives ~0.64 red direct vs
    // ~0.03 red sky, so a 0.3-albedo bounce out-shines the sky in every channel
    // (bifacial-PV rear irradiance is albedo x GHI for the same reason). The
    // checkable facts are the energy relation and that a ground cannot return
    // more than it receives.
    const e = 45, { up, down } = skyIrradiance(0, e)
    const direct = sunColorAt(0, e), mu = Math.sin(e * Math.PI / 180)
    for (let c = 0; c < 3; c++) {
      const received = direct[c]! * mu + up[c]!
      expect(down[c]).toBeCloseTo(ATMOSPHERE.groundAlbedo * received, 12)
      expect(down[c]).toBeLessThan(received)
    }
    const ocean = skyIrradiance(0, e, 0.06)
    for (let c = 0; c < 3; c++) expect(ocean.down[c]).toBeCloseTo(down[c]! * 0.2, 12)
  })
  it('is in plausible relative units: diffuse sky well below the direct sun on a flat surface', () => {
    const { up } = skyIrradiance(0, 45)
    const direct = sunColorAt(0, 45).map((c) => c * Math.sin(45 * Math.PI / 180))
    for (let c = 0; c < 3; c++) {
      expect(up[c]).toBeGreaterThan(0.02)
      expect(up[c]).toBeLessThan(direct[c]!)
    }
  })
  it('is finite, dim and non-zero at the -6 degree dusk floor', () => {
    const noon = skyIrradiance(0, 60), dusk = skyIrradiance(0, -6)
    expect(finite(dusk.up)).toBe(true); expect(finite(dusk.down)).toBe(true)
    for (let c = 0; c < 3; c++) {
      expect(dusk.up[c]).toBeGreaterThan(0)
      expect(dusk.up[c]).toBeLessThan(0.05 * noon.up[c]!)
    }
  })
})

describe('transmittance LUT mapping (Bruneton 2017, 256 x 64)', () => {
  it('is 256 x 64', () => {
    expect([TRANSMITTANCE_LUT_WIDTH, TRANSMITTANCE_LUT_HEIGHT]).toEqual([256, 64])
  })
  it('round-trips (h, mu) for every ray that does not hit the ground', () => {
    const R = ATMOSPHERE.bottomRadiusM
    for (const h of [0, 1, 500, 3000, 12_000, 50_000, 99_000]) {
      const r = R + h
      const muHorizon = -Math.sqrt(Math.max(0, 1 - (R / r) ** 2))
      for (let i = 0; i <= 20; i++) {
        const mu = muHorizon + (1 - muHorizon) * (i / 20)
        const [u, v] = transmittanceLutUv(h, mu)
        expect(u).toBeGreaterThanOrEqual(0.5 / 256 - 1e-12); expect(u).toBeLessThanOrEqual(1 - 0.5 / 256 + 1e-12)
        expect(v).toBeGreaterThanOrEqual(0.5 / 64 - 1e-12); expect(v).toBeLessThanOrEqual(1 - 0.5 / 64 + 1e-12)
        const back = transmittanceLutParams(u, v)
        expect(Math.abs(back.mu - mu)).toBeLessThan(1e-6)
        expect(Math.abs(back.hM - h) / Math.max(1, h)).toBeLessThan(1e-6)
      }
    }
  })
  it('puts sea level on the first texel center and zenith at the first column', () => {
    const [u, v] = transmittanceLutUv(0, 1)
    expect(u).toBeCloseTo(0.5 / 256, 12)
    expect(v).toBeCloseTo(0.5 / 64, 12)
  })
})

describe('multi-scattering LUT mapping (Hillaire 2020, 32 x 32)', () => {
  it('round-trips', () => {
    for (const h of [0, 2000, 40_000, 100_000]) {
      for (const mu of [-1, -0.3, 0, 0.5, 1]) {
        const [u, v] = multiScatteringLutUv(h, mu)
        const back = multiScatteringLutParams(u, v)
        expect(back.muS).toBeCloseTo(mu, 9)
        expect(back.hM).toBeCloseTo(h, 5)
      }
    }
  })
})
