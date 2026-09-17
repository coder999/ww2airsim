import { describe, it, expect } from 'vitest'
import { liftCoefficient, dragCoefficient, aspectRatio, inducedDragFactor, alphaCritRad, groundEffectFactor, sideForceN, SIDESLIP_CRIT_DEG, attachedFlowFraction }
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

/**
 * Flaps are a camber shift: they move the whole attached-flow line up at
 * constant angle of attack. The increment has to go INSIDE `liftCoefficient`'s
 * attached closure, not onto its result, because the post-stall branch takes
 * its peak from that same closure -- which is what makes the two branches
 * meet. Plan 1's finding C1 was a 0.2007 step at exactly that join, worth
 * 1.17 g in the direction of MORE lift past the stall.
 */
describe('lift coefficient with a flap increment', () => {
  it('shifts the whole attached branch up by the increment', () => {
    for (const alphaDeg of [-15, -8, 0, 5, 15]) {
      expect(liftCoefficient(f6f, deg(alphaDeg), 0.4831) - liftCoefficient(f6f, deg(alphaDeg), 0)).toBeCloseTo(
        0.4831,
        9,
      )
    }
  })

  it('carries the increment into the post-stall peak, so the branches still meet', () => {
    const crit = alphaCritRad(f6f)
    for (const sign of [1, -1]) {
      const inside = liftCoefficient(f6f, sign * (crit - 1e-9), 0.4831)
      const outside = liftCoefficient(f6f, sign * (crit + 1e-9), 0.4831)
      expect(Math.abs(outside - inside), `sign ${sign}`).toBeLessThan(1e-6)
    }
  })

  it('still peaks and falls with the flaps down, which is what makes a stall an event', () => {
    const crit = alphaCritRad(f6f)
    const peak = liftCoefficient(f6f, crit, 0.4831)
    expect(peak).toBeGreaterThan(liftCoefficient(f6f, crit + deg(5), 0.4831))
    expect(peak).toBeGreaterThan(liftCoefficient(f6f, crit - deg(5), 0.4831))
  })

  it('raises the peak by the derived ratio, which is the whole point of the number', () => {
    const crit = alphaCritRad(f6f)
    const clean = liftCoefficient(f6f, crit, 0)
    const flapped = liftCoefficient(f6f, crit, f6f.flap.clIncrement)
    // (43.81 / 37.7749)^2, the two sourced stall speeds. Task 4 grades the
    // stall speed itself; this asserts the curve the card depends on.
    expect(flapped / clean).toBeCloseTo(1.3451, 3)
  })

  it('is unchanged from the no-flap curve when the increment is zero or omitted', () => {
    for (const alphaDeg of [-180, -90, -15.5, 0, 15.5, 90, 180]) {
      expect(liftCoefficient(f6f, deg(alphaDeg), 0)).toBe(liftCoefficient(f6f, deg(alphaDeg)))
    }
  })
})

/**
 * Within about a wingspan of the surface the trailing vortex system is
 * constrained by the ground and induced drag falls. McCormick's factor, which
 * has **no fitted constant** -- a property that is load-bearing rather than
 * tidy: it is what leaves `flap.dragAreaM2` as the only unknown entering the
 * graded take-off card, so that card characterises flap drag instead of
 * characterising two guesses against each other.
 */
describe('groundEffectFactor', () => {
  it('matches McCormick at the heights that matter, on this airplane', () => {
    // phi = (16h/b)^2 / (1 + (16h/b)^2), b = geometry.wingSpanM = 13.06 m.
    // Computed 2026-09-17; these are the numbers the design doc tabulates.
    expect(groundEffectFactor(f6f, 1)).toBeCloseTo(0.600, 3)
    expect(groundEffectFactor(f6f, 2)).toBeCloseTo(0.857, 3)
    expect(groundEffectFactor(f6f, 3)).toBeCloseTo(0.931, 3)
  })

  it('is effectively absent a wingspan up, so it cannot reach cruise', () => {
    expect(groundEffectFactor(f6f, f6f.geometry.wingSpanM)).toBeGreaterThan(0.99)
    expect(groundEffectFactor(f6f, 10 * f6f.geometry.wingSpanM)).toBeGreaterThan(0.999)
  })

  it('never leaves [0, 1], including below the surface and on junk input', () => {
    // This multiplies a drag term that reaches the integrator.
    for (const h of [-100, -1, 0, NaN, Infinity, -Infinity, 1e9]) {
      const phi = groundEffectFactor(f6f, h)
      expect(Number.isFinite(phi), `h=${h}`).toBe(true)
      expect(phi).toBeGreaterThanOrEqual(0)
      expect(phi).toBeLessThanOrEqual(1)
    }
  })

  it('increases monotonically with height, so there is no local trap', () => {
    let previous = -1
    for (let h = 0; h <= 30; h += 0.25) {
      const phi = groundEffectFactor(f6f, h)
      expect(phi).toBeGreaterThanOrEqual(previous)
      previous = phi
    }
  })
})

describe('drag coefficient with an induced-drag scale', () => {
  it('scales only the induced term, never the parasitic one', () => {
    const cl = 1.0
    const full = dragCoefficient(f6f, cl, 0, 1)
    const halved = dragCoefficient(f6f, cl, 0, 0.5)
    expect(full - halved).toBeCloseTo(0.5 * inducedDragFactor(f6f) * cl * cl, 12)
    // At zero lift there is no induced drag to scale, so the two agree --
    // which is what "only the induced term" means.
    expect(dragCoefficient(f6f, 0, 0, 1)).toBeCloseTo(dragCoefficient(f6f, 0, 0, 0.1), 12)
  })

  it('is unchanged when the scale is omitted', () => {
    expect(dragCoefficient(f6f, 0.8, deg(6))).toBe(dragCoefficient(f6f, 0.8, deg(6), 1))
    expect(dragCoefficient(f6f, 0.8, deg(40))).toBe(dragCoefficient(f6f, 0.8, deg(40), 1))
  })
})

/**
 * The force that was missing, and the reason the rudder could not turn the
 * airplane.
 *
 * Mark reported 2026-09-17 that holding rudder swings the nose to about 15-20
 * degrees off centre and then stops changing heading. The nose behaviour is
 * correct and designed: sideslip builds until the weathercock's restoring yaw
 * rate cancels the rudder's commanded one, an equilibrium at
 * `maxYawRateDegPerSec * weathercockSeconds` = 22.5 degrees, independent of
 * speed because both terms scale by the same authority.
 *
 * What was wrong is that the HEADING then never changed, because the model had
 * **no lateral aerodynamic force at all**. Nothing converted sideslip into a
 * sideways push, so the flight path never bent round to follow the nose and
 * the airplane crabbed forever, flying dead straight. This is the airborne
 * twin of `lateralGripAfter`'s tire force (`src/sim/ground.ts`), added the
 * same day for the same reason on the ground.
 */
describe('side force from sideslip', () => {
  it('is zero with no sideslip, whatever the speed', () => {
    expect(sideForceN(f6f, 50_000, 0)).toBe(0)
  })

  it('grows with sideslip and with dynamic pressure', () => {
    expect(sideForceN(f6f, 1000, deg(10))).toBeGreaterThan(sideForceN(f6f, 1000, deg(5)))
    expect(sideForceN(f6f, 2000, deg(10))).toBeCloseTo(2 * sideForceN(f6f, 1000, deg(10)), 9)
  })

  it('takes the sign of the sideslip, so it always opposes the sideways motion', () => {
    // Positive sideslip means the velocity has a component toward the body's
    // right, so the relative wind strikes the right side and the force on the
    // airplane is to the LEFT -- opposing the motion that created it. `step`
    // applies it along -right, so this function returns the magnitude with the
    // sideslip's own sign and the direction is the caller's.
    expect(sideForceN(f6f, 1000, deg(-10))).toBeCloseTo(-sideForceN(f6f, 1000, deg(10)), 9)
  })

  it('is the wing area times the coefficient slope times dynamic pressure', () => {
    // Shaped exactly like the lift term -- q * S * C -- rather than as a drag
    // AREA the way the gear and flaps are, because it has a per-radian slope
    // and so mirrors `clSlopePerRad` instead of `dragAreaM2`.
    const beta = deg(8)
    expect(sideForceN(f6f, 1500, beta)).toBeCloseTo(
      1500 * f6f.geometry.wingAreaM2 * f6f.aero.cySlopePerRad * beta,
      9,
    )
  })

  it('is big enough to matter at all, which is a weaker claim than it looks', () => {
    // RE-BASED 2026-09-17. This asserted a lateral acceleration above
    // 0.3 m/s^2, a threshold I invented; the shipped coefficient produces
    // 0.19 and the useful question is not the acceleration but whether the
    // FLIGHT PATH turns. `tests/sim/flight/sideForce.test.ts` measures that
    // end to end -- 25.1 degrees of track in 30 s of full rudder, against
    // 0.0 before this term existed -- and this case is left as a floor
    // against the term being switched off by a retune to nearly zero.
    const q = 0.5 * 1.225 * 40 * 40
    const accel = sideForceN(f6f, q, deg(20)) / f6f.reference.testMassKg
    expect(accel).toBeGreaterThan(0.1)
    expect(accel).toBeLessThan(5)
  })

  it('never returns a non-finite force', () => {
    for (const [q, beta] of [[NaN, 0.1], [1000, NaN], [Infinity, 0.1], [1000, Infinity]] as const) {
      expect(Number.isFinite(sideForceN(f6f, q, beta)), `q=${q} beta=${beta}`).toBe(true)
    }
  })
})

describe('side force saturation past the fin stall', () => {
  it('stops growing past the critical sideslip instead of running to 90 degrees', () => {
    // **The defect this exists to prevent, found by the climb card 2026-09-17.**
    // Written as an unbounded linear slope, this term reached 2886 N in a
    // departed state where `asin(dot(vdir, right))` read -88.5 degrees -- a
    // number that is not a sideslip in any useful sense -- and corrupted
    // `measureClimbRate`'s pitch sweep by 33%. The lift curve peaks and falls
    // for the same reason; a fin stalls too.
    const peak = sideForceN(f6f, 1000, deg(SIDESLIP_CRIT_DEG))
    expect(sideForceN(f6f, 1000, deg(45))).toBeCloseTo(peak, 9)
    expect(sideForceN(f6f, 1000, deg(89))).toBeCloseTo(peak, 9)
    expect(sideForceN(f6f, 1000, deg(-89))).toBeCloseTo(-peak, 9)
  })

  it('is still linear inside the critical sideslip, where approaches happen', () => {
    // The whole useful range -- a rudder input on final reaches 15-20 degrees.
    for (const d of [1, 5, 10, SIDESLIP_CRIT_DEG - 1]) {
      expect(sideForceN(f6f, 1000, deg(d))).toBeCloseTo(
        1000 * f6f.geometry.wingAreaM2 * f6f.aero.cySlopePerRad * deg(d),
        9,
      )
    }
  })

  it('has a critical sideslip in the range a fin actually stalls at', () => {
    expect(SIDESLIP_CRIT_DEG).toBeGreaterThanOrEqual(12)
    expect(SIDESLIP_CRIT_DEG).toBeLessThanOrEqual(30)
  })
})

describe('attachedFlowFraction', () => {
  it('is 1 everywhere inside the stall and 0 at 90 degrees', () => {
    for (const d of [0, 5, -10, 15]) expect(attachedFlowFraction(f6f, deg(d))).toBe(1)
    expect(attachedFlowFraction(f6f, deg(90))).toBeCloseTo(0, 12)
    expect(attachedFlowFraction(f6f, deg(-90))).toBeCloseTo(0, 12)
  })

  it('blends rather than stepping, so nothing snaps at the stall boundary', () => {
    const crit = alphaCritRad(f6f)
    expect(attachedFlowFraction(f6f, crit + 1e-9)).toBeCloseTo(1, 6)
    expect(attachedFlowFraction(f6f, crit + deg(20))).toBeGreaterThan(0)
    expect(attachedFlowFraction(f6f, crit + deg(20))).toBeLessThan(1)
  })

  it('stays 0 beyond 90 degrees, which `angleOfAttack` routinely reaches', () => {
    // `angleOfAttack` is an atan2 spanning the full +/-180 degrees, and the
    // soak measured 40.8% of steps past 90.5 degrees.
    for (const d of [95, 140, 180, -140]) {
      expect(attachedFlowFraction(f6f, deg(d)), `${d} deg`).toBe(0)
    }
  })

  it('is 0 for a non-finite alpha rather than 1', () => {
    // It multiplies a force. "I do not know" must not mean "full force".
    expect(attachedFlowFraction(f6f, NaN)).toBe(0)
  })
})
