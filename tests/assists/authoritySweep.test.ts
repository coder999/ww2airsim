import { describe, it, expect } from 'vitest'
import {
  applyAssistsWithAuthority,
  DEFAULT_ASSIST_SETTINGS,
  NOT_HOLDING,
  type AltitudeHoldMemory,
  type AssistSettings,
} from '../../src/assists/index.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { DT, angleOfAttack, clampFinite } from '../../src/sim/flight/model.js'
import { alphaCritRad } from '../../src/sim/aero.js'
import { v3, add, scale } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qRotate, type Quat } from '../../src/sim/math/quat.js'
import { createRng } from '../../src/sim/rng.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * The committed property sweep over the assists stack, and the guard the final
 * whole-branch review asked for by name.
 *
 * WHY IT EXISTS. Plan 3 produced the same Critical three times in one shape:
 * two assists voting on the pitch axis with nothing arbitrating between them.
 * Each instance was found by a reviewer's throwaway sweep over a SPACE, then
 * distilled into point assertions and the sweep discarded -- so the next
 * instance had to be found by hand again. The third survived because the
 * invariant the suite did have ("the command lies inside the limiter's bound")
 * was VACUOUS exactly where it mattered: past 90 degrees of alpha the limiter
 * publishes no bound, and "inside no bound" is not a statement. This file's
 * invariant is total over alpha instead, because the budget
 * (`PitchAuthority`) is published on every path, including the departed one.
 *
 * WHAT IT ASSERTS, and why each clause is total rather than conditional:
 *
 *  1. the published budget is non-empty (`lower <= upper`);
 *  2. it never leaves the pilot's own legal range, [-1, 1];
 *  3. the command the stack returns is inside it, exactly, not to a tolerance;
 *  4. past `DEPARTED_ALPHA_RAD` the budget is the pilot's own command and
 *     nothing else -- narrowed to a single value, so no assist has a vote on
 *     the axis while the wing is gone;
 *  5. with all three assists off the stack is the identity on the pilot's
 *     (sanitised) command, so a stage that ignores its own flag cannot hide
 *     behind the four clauses above.
 *
 * The departed clause is evaluated against `angleOfAttack` through the same
 * `!(Math.abs(alpha) < PI/2)` predicate `src/assists/index.ts` uses, rather
 * than against the alpha this file ASKED for at a 0.5-degree standoff -- so
 * there is no band of alpha where the sweep checks nothing, which is precisely
 * how the third Critical survived.
 *
 * HOW IT RELATES TO `index.test.ts`'s alpha sweep, which is not deleted. That
 * one is a deterministic lattice: every integer alpha from -180 to 180 at two
 * speeds, wings level, one throttle, legal pitches only. It cannot miss an
 * integer degree. This one samples the dimensions that lattice holds fixed --
 * attitude including rolled and inverted, sideslip, speed down to nearly zero,
 * altitude, throttle, step size, held-altitude error either side, and illegal
 * pitch commands -- across a fine alpha grid around both boundaries. Neither
 * contains the other, and the pair costs well under a second.
 *
 * COST AND SHAPE. Sampled rather than exhaustive on purpose: the full cross
 * product of these dimensions is astronomical and this runs in CI on every
 * `npm run verify`. Measured 2026-09-13 on node v22.22.1: 177 alphas x 48
 * draws x 8 settings combinations = 67,968 stack evaluations in 254 ms for the
 * sweep case, 578 ms for the whole file including loading the spec -- against
 * 13.5 s for the suite it joins. The draws come from `createRng` (mulberry32,
 * bit-identical across platforms by construction -- see that file) off a fixed
 * seed, so a failure is reproducible from its message alone and two CI runs of
 * one commit cannot sweep different spaces.
 *
 * PROVED TO DISCRIMINATE, 2026-09-13, by re-introducing each of the two defect
 * shapes this exists for and counting what fails:
 *
 *  - the departed-region defect (the third Critical): `runStack`'s
 *    `isDeparted(state) ? narrowToCommand(FULL_PITCH_AUTHORITY, rawPitch) :
 *    FULL_PITCH_AUTHORITY` replaced by `FULL_PITCH_AUTHORITY` unconditionally,
 *    i.e. the budget NOT narrowed to the pilot's own command past the
 *    threshold. 31,368 cases fail -- every departed case, at every settings
 *    combination -- and every one of them fails on clause 4 and on nothing
 *    else. Clauses 1, 2, 3 and 5 stay satisfied, which is exactly why clause 4
 *    is separate: the command is still inside [-1, 1], so a
 *    "command inside the budget" check alone is blind to it. That blindness is
 *    what let the defect ship.
 *  - the original C1 shape (altitude hold voting outside its authority):
 *    `altitudeHold`'s final `withinAuthority(authority, uncapped)` replaced by
 *    `uncapped`. 4,988 cases fail, all on clause 3, including the +1.0000
 *    nose-up-on-a-departed-wing command the final review measured by hand.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const CRIT_DEG = (alphaCritRad(f6f) * 180) / Math.PI
const DEPARTED_DEG = 90

/** Randomised draws per alpha. 48 x 177 alphas x 8 settings combinations is
 *  67,968 stack evaluations, which is the largest this file could be while
 *  still being a rounding error on `npm run verify` -- see the header for the
 *  measured runtime. */
const DRAWS = 48

/** Every combination of the three flags. Enumerated rather than sampled: there
 *  are only eight, and a stage wired to the wrong flag shows up in exactly one
 *  of them. */
const ALL_SETTINGS_COMBOS: AssistSettings[] = (() => {
  const combos: AssistSettings[] = []
  for (const stallLimiter of [true, false]) {
    for (const autoRudder of [true, false]) {
      for (const altitudeHold of [true, false]) combos.push({ stallLimiter, autoRudder, altitudeHold })
    }
  }
  return combos
})()

/**
 * The alpha grid: fine either side of both boundaries the stack changes
 * behaviour at, coarse in between, and it reaches +-180 in both directions
 * because alpha here is an `atan2` that runs the whole circle (see
 * `angleOfAttack`), not a small-angle quantity.
 *
 * The two boundaries are `alphaCritDeg` (15.5 for this content, where the
 * limiter's bound crosses zero and starts commanding recovery) and 90
 * (`DEPARTED_ALPHA_RAD`, where every assist stands down and the budget
 * collapses onto the pilot). Both are included EXACTLY, and both are
 * approached from both sides at 0.1 degrees, because both previous Criticals
 * lived within a degree of a boundary that every hand-picked test sat clear of.
 */
const ALPHA_GRID_DEG: number[] = (() => {
  const seen = new Set<number>()
  const add1 = (deg: number) => seen.add(Number(deg.toFixed(4)))
  for (const boundary of [CRIT_DEG, DEPARTED_DEG]) {
    for (const sign of [1, -1]) {
      for (const delta of [-2, -1, -0.5, -0.1, 0, 0.1, 0.5, 1, 2, 5]) add1(sign * boundary + delta)
    }
  }
  for (let deg = -180; deg <= 180; deg += 2.5) add1(deg)
  return [...seen].sort((a, b) => a - b)
})()

/** One randomised draw: everything about the aeroplane and the pilot except
 *  the angle of attack, which the caller sweeps, and the settings, which are
 *  enumerated. */
type Draw = {
  readonly speed: number
  readonly altitudeM: number
  readonly sideslipDeg: number
  /** An arbitrary attitude, upright or not -- see `randomAttitude`. */
  readonly attitude: Quat
  readonly raw: Controls
  readonly memory: AltitudeHoldMemory
  readonly dt: number
}

/** Values `Controls.pitch` documents as illegal, drawn on some of the passes so
 *  the budget's truthfulness is swept over them too (design open item 2, fixed
 *  by sanitising them at `runStack`'s entry -- this is the sweep that keeps it
 *  fixed). The same list `tools/soak/run.ts` injects, for the same reason. */
const ILLEGAL_PITCHES = [5, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const

function rollDraw(rng: () => number, n: number): Draw {
  // Speed spans the content envelope and, on one draw in eight, nearly zero --
  // the state where there is no pitch authority to ration and both the limiter
  // and altitude hold stand down on their own guards.
  const speed = rng() < 0.125 ? rng() * 2 : 20 + rng() * 230
  const altitudeM = 50 + rng() * 9000
  // Held either side of where the aeroplane is, and sometimes exactly at it:
  // altitude hold wants nose-up in one case and nose-down in the other, and a
  // budget that only ever vetoes one direction would pass a one-sided sweep.
  const heldOffsetM = (rng() - 0.5) * 1200
  const centredStick = rng() < 0.4
  const illegal = rng() < 0.15
  const raw: Controls = {
    // A centred stick on 40% of draws, because that is the only condition
    // under which altitude hold engages at all, and its vote is half of what
    // the budget arbitrates. The illegal draws deliberately overlap the
    // centred ones: NaN is not "centred" and must not be read as such.
    pitch: centredStick ? 0 : illegal ? ILLEGAL_PITCHES[n % ILLEGAL_PITCHES.length]! : (rng() - 0.5) * 2,
    roll: (rng() - 0.5) * 2,
    yaw: (rng() - 0.5) * 2,
    throttle: rng(),
  }
  return {
    speed,
    altitudeM,
    // Beyond +-60 degrees the cos(beta) factor in the velocity construction
    // below would stop being positive and the constructed alpha would flip;
    // +-60 is already three times the largest sideslip the soak produces.
    sideslipDeg: (rng() - 0.5) * 120,
    attitude: randomAttitude(rng),
    raw,
    memory: rng() < 0.2 ? NOT_HOLDING : { heldAltitudeM: altitudeM + heldOffsetM },
    // Mostly the production fixed step; sometimes longer than
    // `stallLimiterSeconds` (0.15 s), which is the branch where the limiter
    // rations its margin over the step instead of over its time constant.
    dt: rng() < 0.8 ? DT : 0.05 + rng() * 0.45,
  }
}

/** An arbitrary unit attitude: an arbitrary axis and an arbitrary angle, which
 *  covers the whole attitude sphere including rolled and inverted. Exactly
 *  `tools/soak/run.ts`'s `randomAttitude`, and for its stated reason -- every
 *  other test in this directory spawns at `qIdentity()`, so wings-level upright
 *  was the only attitude the assists had ever been swept at. */
function randomAttitude(rng: () => number): Quat {
  return qFromAxisAngle(v3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1), rng() * 2 * Math.PI)
}

/**
 * A state at EXACTLY `alphaDeg`, at an arbitrary attitude and with an arbitrary
 * sideslip.
 *
 * Built from the body axes rather than by tipping the velocity in world space:
 * `angleOfAttack` is `atan2(-dot(vn, up), dot(vn, forward))` on the BODY axes,
 * so with
 *     v = speed * (cos(a)cos(b) * forward - sin(a)cos(b) * up + sin(b) * right)
 * the two dot products are `speed*cos(a)cos(b)` and `-speed*sin(a)cos(b)`, and
 * the shared positive `speed*cos(b)` cancels inside the `atan2` -- so alpha is
 * exactly `a` at any attitude and any |b| < 90, and the sideslip component is
 * free. The sweep asserts that cancellation numerically rather than trusting
 * it (`worstAlphaErrorDeg`), which also makes this file a second, independent
 * check of design open item 8's retraction: alpha does not move when a crab is
 * added.
 *
 * The attitude is the drawn one, unmodified -- the velocity is built from ITS
 * axes, so there is no second rotation here to get the order of.
 */
function stateAt(alphaDeg: number, d: Draw): AircraftState {
  const forward = qRotate(d.attitude, v3(1, 0, 0))
  const up = qRotate(d.attitude, v3(0, 1, 0))
  const right = qRotate(d.attitude, v3(0, 0, 1))
  const a = (alphaDeg * Math.PI) / 180
  const b = (d.sideslipDeg * Math.PI) / 180
  const velocity = add(
    add(scale(forward, d.speed * Math.cos(a) * Math.cos(b)), scale(up, -d.speed * Math.sin(a) * Math.cos(b))),
    scale(right, d.speed * Math.sin(b)),
  )
  return createState({ position: v3(0, d.altitudeM, 0), velocity, attitude: d.attitude, fuelKg: 400 })
}

/** The same predicate `src/assists/index.ts` stands down on, called on the same
 *  public `angleOfAttack` -- negated rather than written `>=` so a NaN alpha
 *  counts as departed there and here. Written here rather than exported from
 *  there so that a change to the production predicate that this sweep does not
 *  follow shows up as a failure rather than as agreement by construction. */
const isDeparted = (state: AircraftState): boolean =>
  !(Math.abs(angleOfAttack(state)) < (DEPARTED_DEG * Math.PI) / 180)

describe('property sweep: the pitch-authority budget is total over alpha', () => {
  it('holds every clause at every sampled point of the space', () => {
    const rng = createRng(20260913)
    const draws = Array.from({ length: DRAWS }, (_, n) => rollDraw(rng, n))

    const violations: string[] = []
    let cases = 0
    // Coverage counters, asserted below. A sweep that stopped reaching one of
    // these regions -- because a constant moved, or because a draw narrowed --
    // would otherwise keep passing while checking nothing interesting, which is
    // the failure mode `tests/sim/soak.test.ts`'s floors exist to catch and the
    // same remedy applied here.
    let departedCases = 0
    let stalledBandCases = 0
    let limiterVotedCases = 0
    let holdVotedCases = 0
    let rolledCases = 0
    let illegalPitchCases = 0
    let worstAlphaErrorDeg = 0

    for (const alphaDeg of ALPHA_GRID_DEG) {
      for (const d of draws) {
        const s = stateAt(alphaDeg, d)
        const departed = isDeparted(s)
        const actualAlphaDeg = (angleOfAttack(s) * 180) / Math.PI
        if (d.speed > 1) {
          // Compared modulo the circle: alpha is an `atan2`, so asking for
          // -180 legitimately comes back as +180 and a plain subtraction would
          // report a 360-degree error at the one point where the two agree.
          const errDeg = Math.abs((((actualAlphaDeg - alphaDeg) % 360) + 540) % 360 - 180)
          worstAlphaErrorDeg = Math.max(worstAlphaErrorDeg, errDeg)
        }
        // "Rolled" measured as the wings being out of the horizontal plane by
        // more than 30 degrees: body right is horizontal for any attitude
        // reachable by heading and pitch alone, so |right.y| isolates roll
        // rather than counting a pitched-up aeroplane as a banked one.
        if (Math.abs(qRotate(d.attitude, v3(0, 0, 1)).y) > 0.5) rolledCases++
        if (!Number.isFinite(d.raw.pitch) || Math.abs(d.raw.pitch) > 1) illegalPitchCases++
        const legalPitch = clampFinite(d.raw.pitch, -1, 1)

        for (const enabled of ALL_SETTINGS_COMBOS) {
          cases++
          const { controls, pitchAuthority } = applyAssistsWithAuthority(
            s,
            f6f,
            d.raw,
            d.dt,
            enabled,
            d.memory,
          )
          const where =
            `alpha ${alphaDeg} deg (actual ${actualAlphaDeg.toFixed(3)}), ${d.speed.toFixed(1)} m/s, ` +
            `${d.altitudeM.toFixed(0)} m, slip ${d.sideslipDeg.toFixed(1)} deg, ` +
            `attitude ${JSON.stringify(d.attitude)}, ` +
            `dt ${d.dt.toFixed(4)}, raw ${JSON.stringify(d.raw)}, held ${String(d.memory.heldAltitudeM)}, ` +
            JSON.stringify(enabled)
          const fail = (why: string) => violations.push(`${why} -- at ${where}`)

          // 1: a published budget is a range, not an impossibility.
          if (!(pitchAuthority.lower <= pitchAuthority.upper)) {
            fail(`empty budget ${JSON.stringify(pitchAuthority)}`)
          }
          // 2: narrowed, never widened past the pilot's own legal range.
          if (!(pitchAuthority.lower >= -1 && pitchAuthority.upper <= 1)) {
            fail(`budget outside [-1, 1]: ${JSON.stringify(pitchAuthority)}`)
          }
          // 3: the claim is true of the command published with it. Exact, not
          // to a tolerance: every producer of this value ends in a clamp
          // against these exact bounds, so a tolerance here would only hide a
          // stage that had stopped clamping.
          if (!(controls.pitch >= pitchAuthority.lower && controls.pitch <= pitchAuthority.upper)) {
            fail(`commanded ${controls.pitch} outside ${JSON.stringify(pitchAuthority)}`)
          }
          // 4: past the stand-down, the axis belongs to the pilot alone. Not
          // "unlimited" (what shipped, and what let altitude hold command full
          // nose-up on a departed wing) and not "nothing" (which would pin the
          // stick of a pilot flying out of a departure).
          if (departed) {
            departedCases++
            if (pitchAuthority.lower !== legalPitch || pitchAuthority.upper !== legalPitch) {
              fail(`departed budget ${JSON.stringify(pitchAuthority)} is not the pilot's own ${legalPitch}`)
            }
          } else if (Math.abs(actualAlphaDeg) > CRIT_DEG) {
            stalledBandCases++
          }
          // 5: an assist that is switched off has no vote, on any axis.
          if (!enabled.stallLimiter && !enabled.autoRudder && !enabled.altitudeHold) {
            if (controls.pitch !== legalPitch || controls.yaw !== d.raw.yaw || controls.roll !== d.raw.roll) {
              fail(`all assists off but the command moved: ${JSON.stringify(controls)}`)
            }
          }
          // The command must also stay inside the range its own type documents,
          // which clause 2 plus clause 3 imply for pitch but not for yaw --
          // auto-rudder is the only stage that writes yaw and no budget
          // arbitrates that axis.
          if (!(controls.yaw >= -1 && controls.yaw <= 1) || !Number.isFinite(controls.pitch)) {
            fail(`command outside the legal control range: ${JSON.stringify(controls)}`)
          }

          if (enabled.stallLimiter && !enabled.altitudeHold && controls.pitch !== legalPitch) {
            limiterVotedCases++
          }
          if (
            enabled.altitudeHold &&
            !enabled.stallLimiter &&
            d.raw.pitch === 0 &&
            controls.pitch !== legalPitch
          ) {
            holdVotedCases++
          }
        }
      }
    }

    expect(violations.slice(0, 5)).toEqual([])
    expect(violations.length).toBe(0)

    // The sweep swept what it claims to have swept. Every figure below was
    // measured on this seed 2026-09-13 (node v22.22.1) and the floors are set
    // well under it, the same convention `tests/sim/soak.test.ts` uses:
    // re-measure and move the floor, never the assertion. A sweep whose draws
    // or grid narrowed would otherwise keep passing while no longer visiting
    // the regions the whole file exists for.
    //
    // Measured: 177 alphas x 48 draws x 8 combinations = 67,968 cases, of which
    // 31,368 departed, 28,488 in the stalled band below 90 degrees, 6,928 where
    // the limiter moved the command with altitude hold off, and 2,280 where
    // altitude hold moved it with the limiter off. Of the 8,496 (alpha, draw)
    // pairs -- these two are per pair, not per case, because they are
    // properties of the draw -- 3,186 have the wings more than 30 degrees out
    // of horizontal and 708 carry an illegal raw pitch. The constructed alpha
    // lands within 1.14e-13 degrees of the alpha asked for.
    expect(cases).toBe(ALPHA_GRID_DEG.length * DRAWS * 8)
    expect(cases).toBeGreaterThan(60000)
    expect(departedCases).toBeGreaterThan(20000)
    expect(stalledBandCases).toBeGreaterThan(20000)
    expect(limiterVotedCases).toBeGreaterThan(4000)
    expect(holdVotedCases).toBeGreaterThan(1500)
    expect(rolledCases).toBeGreaterThan(2000)
    expect(illegalPitchCases).toBeGreaterThan(400)
    expect(worstAlphaErrorDeg).toBeLessThan(1e-9)
  })

  it('is the shipped configuration that is swept, not a configuration invented here', () => {
    // `DEFAULT_ASSIST_SETTINGS` must be one of the eight combinations above --
    // otherwise the sweep could be exhaustive over a space that does not
    // contain the aeroplane anybody flies.
    expect(ALL_SETTINGS_COMBOS).toContainEqual(DEFAULT_ASSIST_SETTINGS)
    expect(ALL_SETTINGS_COMBOS).toHaveLength(8)
  })
})
