import { describe, it, expect } from 'vitest'
import { liftCoefficient, dragCoefficient, aspectRatio, inducedDragFactor, alphaCritRad }
  from '../../src/sim/aero.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const deg = (d: number) => (d * Math.PI) / 180

describe('lift coefficient curve', () => {
  it('equals clAtZeroAlpha at zero angle of attack', () => {
    expect(liftCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.clAtZeroAlpha, 6)
  })

  it('rises linearly below the critical angle', () => {
    const a = liftCoefficient(f6f, deg(4))
    const b = liftCoefficient(f6f, deg(8))
    expect(b - a).toBeCloseTo(f6f.aero.clSlopePerRad * deg(4), 4)
  })

  it('peaks at clMax at the critical angle', () => {
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))).toBeCloseTo(f6f.aero.clMax, 1)
  })

  it('falls past the critical angle rather than rising forever', () => {
    const peak = liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 8))).toBeLessThan(peak)
    expect(liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg + 20))).toBeLessThan(peak)
  })

  it('is antisymmetric-ish for negative alpha and never NaN', () => {
    for (let d = -90; d <= 90; d += 1) {
      expect(Number.isFinite(liftCoefficient(f6f, deg(d)))).toBe(true)
    }
    expect(liftCoefficient(f6f, deg(-20))).toBeLessThan(0)
  })
})

/**
 * Finding C1: the post-stall branch decayed from `clMax` regardless of the
 * sign of alpha, so on the negative side the curve STEPPED UP at the stall
 * (Cl(-15.50 deg) = -1.200013 -> Cl(-15.51 deg) = -1.399860, a 0.2007 jump =
 * 1.17 g at the trial weight) and produced *more* lift past the stall instead
 * of less. Nothing here caught it: the old checks were finiteness across
 * +/-90 degrees, `Cl(-20 deg) < 0`, and a fall-off test on the positive side
 * only.
 *
 * These assertions are written against spec fields rather than this
 * aircraft's numbers so they carry over unchanged to the five other aircraft
 * a later plan adds. They hold for any spec whose attached-flow line grows in
 * magnitude in both directions out of alpha = 0, i.e.
 * |clAtZeroAlpha| < clSlopePerRad * alphaCritRad -- true of any real cambered
 * or symmetric wing, and asserted below so a spec that violated it would say
 * so rather than silently weakening the rest of the case.
 */
describe('lift curve is continuous and peaks at the stall on BOTH sides (finding C1)', () => {
  const variant = (aero: Partial<AircraftSpec['aero']>): AircraftSpec =>
    ({ ...f6f, aero: { ...f6f.aero, ...aero } }) satisfies AircraftSpec

  const specs: Array<[string, AircraftSpec]> = [
    ['f6f-hellcat (shipped)', f6f],
    ['symmetric section (clAtZeroAlpha = 0)', variant({ clAtZeroAlpha: 0 })],
    ['reflexed section (clAtZeroAlpha < 0)', variant({ clAtZeroAlpha: -0.12 })],
    ['high-camber, early stall', variant({ clAtZeroAlpha: 0.35, alphaCritDeg: 11, clSlopePerRad: 5.4 })],
    ['late stall, shallow slope', variant({ alphaCritDeg: 22, clSlopePerRad: 3.9 })],
  ]

  describe.each(specs)('%s', (_name, spec) => {
    const crit = alphaCritRad(spec)
    const cl = (a: number) => liftCoefficient(spec, a)

    it('has an attached-flow line that grows in magnitude both ways from zero', () => {
      // The precondition the peak assertions below rest on.
      expect(Math.abs(spec.aero.clAtZeroAlpha)).toBeLessThan(spec.aero.clSlopePerRad * crit)
    })

    it.each([1, -1])('is continuous across the stall boundary at sign %i', (sign) => {
      const eps = 1e-6
      const inside = cl(sign * (crit - eps))
      const outside = cl(sign * (crit + eps))
      expect(Math.abs(outside - inside)).toBeLessThan(1e-3)
      // Same side of zero, too: a sign flip across the boundary would be a
      // 2x-magnitude "continuity" pass if only |Cl| were compared.
      expect(Math.sign(outside)).toBe(Math.sign(inside))
    })

    it.each([1, -1])('loses lift immediately past the stall at sign %i', (sign) => {
      // This is the assertion whose absence hid C1 on the negative side: past
      // the boundary the magnitude must be BELOW the peak, where before the
      // fix the negative side jumped 0.2007 above it.
      //
      // Compared against the peak at exactly `crit`, not against a point just
      // inside it: the review's proposed form,
      // |Cl(-crit - eps)| < |Cl(-crit + eps)|, cannot hold for any curve that
      // peaks AT crit, because just inside the boundary the attached line is
      // still climbing and so sits below the peak -- here by
      // clSlopePerRad*eps = 4.8e-4 against the post-stall branch's 8e-5 loss
      // over the same eps.
      const eps = 1e-4
      expect(Math.abs(cl(sign * (crit + eps)))).toBeLessThan(Math.abs(cl(sign * crit)))
    })

    it.each([1, -1])('falls monotonically in magnitude beyond the stall at sign %i', (sign) => {
      // Out to 180 degrees, not 90: `angleOfAttack` is an atan2 and reaches
      // the whole range. Non-increasing rather than strictly decreasing
      // because POST_STALL_FLOOR deliberately flattens the far end.
      let prev = Math.abs(cl(sign * crit))
      for (let d = spec.aero.alphaCritDeg + 0.5; d <= 180; d += 0.5) {
        const here = Math.abs(cl(sign * deg(d)))
        expect(here).toBeLessThanOrEqual(prev + 1e-12)
        prev = here
      }
    })

    it.each([1, -1])('falls strictly over the first 30 degrees past the stall at sign %i', (sign) => {
      let prev = Math.abs(cl(sign * crit))
      for (let d = spec.aero.alphaCritDeg + 1; d <= spec.aero.alphaCritDeg + 30; d += 1) {
        const here = Math.abs(cl(sign * deg(d)))
        expect(here).toBeLessThan(prev)
        prev = here
      }
    })

    it('attains its maximum |Cl| at the critical angle, on whichever side is being swept', () => {
      for (const sign of [1, -1]) {
        const peak = Math.abs(cl(sign * crit))
        for (let d = 0; d <= 180; d += 0.25) {
          expect(
            Math.abs(cl(sign * deg(d))),
            `|Cl(${sign * d} deg)| exceeds the peak at ${sign * spec.aero.alphaCritDeg} deg`,
          ).toBeLessThanOrEqual(peak + 1e-12)
        }
      }
    })
  })
})

describe('drag coefficient', () => {
  it('is minimum at zero lift and equals cd0 there', () => {
    expect(dragCoefficient(f6f, 0)).toBeCloseTo(f6f.aero.cd0, 6)
  })

  it('increases with the square of lift', () => {
    const d1 = dragCoefficient(f6f, 0.4) - f6f.aero.cd0
    const d2 = dragCoefficient(f6f, 0.8) - f6f.aero.cd0
    expect(d2 / d1).toBeCloseTo(4, 2)
  })

  it('is symmetric in the sign of lift', () => {
    expect(dragCoefficient(f6f, -0.6)).toBeCloseTo(dragCoefficient(f6f, 0.6), 9)
  })
})

describe('post-stall drag blend (Important 3)', () => {
  it('is unchanged at or below the critical angle', () => {
    const cl = liftCoefficient(f6f, deg(10))
    expect(dragCoefficient(f6f, cl, deg(10))).toBeCloseTo(dragCoefficient(f6f, cl), 9)
    const clAtCrit = liftCoefficient(f6f, deg(f6f.aero.alphaCritDeg))
    expect(dragCoefficient(f6f, clAtCrit, deg(f6f.aero.alphaCritDeg)))
      .toBeCloseTo(dragCoefficient(f6f, clAtCrit), 9)
  })

  it('rises monotonically past the critical angle, using the true post-stall Cl at each angle', () => {
    const angles = [f6f.aero.alphaCritDeg, 25, 35, 45, 60, 75, 90]
    const cds = angles.map((d) => dragCoefficient(f6f, liftCoefficient(f6f, deg(d)), deg(d)))
    for (let i = 1; i < cds.length; i++) {
      expect(cds[i]!).toBeGreaterThan(cds[i - 1]!)
    }
  })

  it('approaches a flat-plate value near 90 degrees', () => {
    const cd90 = dragCoefficient(f6f, liftCoefficient(f6f, deg(90)), deg(90))
    expect(cd90).toBeGreaterThan(1.0)
    expect(cd90).toBeLessThanOrEqual(1.2)
  })

  it('is never non-finite across the full angle range', () => {
    for (let d = -180; d <= 180; d += 1) {
      const cl = liftCoefficient(f6f, deg(d))
      expect(Number.isFinite(dragCoefficient(f6f, cl, deg(d)))).toBe(true)
    }
  })

  it('never goes negative, even for an alphaCritDeg beyond 90 degrees (round 2 minor)', () => {
    // schema.ts only requires alphaCritDeg > 0, not < 90. No shipped spec
    // does this, but nothing stops one from having alphaCritDeg=120: the
    // blend fraction's span (90 - alphaCritDeg) then goes negative, and
    // without a floor on `t` this drove Cd to -0.9269394412426326 at 150 degrees --
    // drag that accelerates the aircraft. `t` is now clamped to [0, 1] on
    // both ends, so past-the-stall Cd for a spec like this should just sit
    // at its attached-flow value (no post-stall blend applies) rather than
    // going negative.
    const wideStallSpec = {
      ...f6f,
      aero: { ...f6f.aero, alphaCritDeg: 120 },
    } satisfies AircraftSpec
    const cl = liftCoefficient(wideStallSpec, deg(150))
    const cd = dragCoefficient(wideStallSpec, cl, deg(150))
    expect(cd).toBeGreaterThanOrEqual(f6f.aero.cd0)
  })
})

describe('geometry derived values', () => {
  it('computes aspect ratio as span squared over area', () => {
    expect(aspectRatio(f6f)).toBeCloseTo((13.06 * 13.06) / 31.03, 6)
  })

  it('computes the induced drag factor as 1/(pi*AR*e)', () => {
    expect(inducedDragFactor(f6f)).toBeCloseTo(1 / (Math.PI * aspectRatio(f6f) * f6f.aero.oswaldE), 9)
  })
})
