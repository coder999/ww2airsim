import { describe, it, expect } from 'vitest'
import { initialFrameState, nextFrameState, type FrameState } from '../../src/render/frame.js'
import { DEFAULT_ASSIST_SETTINGS, type AssistSettings } from '../../src/assists/index.js'
import { angleOfAttack, DT } from '../../src/sim/flight/model.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { alphaCritRad } from '../../src/sim/aero.js'
import { v3, dot, length, normalize } from '../../src/sim/math/vec3.js'
import { qIdentity, qRotate } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

/**
 * The assists layer through the PRODUCTION call path, `nextFrameState`.
 *
 * Why this file exists, and why it is not more of the same. Tasks 1-4 built
 * three assists and tested each of them by calling `applyAssists` directly.
 * That left a gap nothing in the suite could see: `advance` accepts an injected
 * assist, but until Task 5 nothing in the production path passed a real one, so
 * the entire layer was inert in the browser AND every one of those behavioural
 * tests still passed. A test that calls `applyAssists` itself cannot tell a
 * wired-up application from an unwired one.
 *
 * So every test here goes in through `nextFrameState` -- the same function
 * `src/render/main.ts`'s animation-frame callback calls, with keys as its only
 * input -- and asserts a PHYSICAL outcome that a wiring which silently did
 * nothing could not produce. In each case the "wiring does nothing" trajectory
 * is measured in the same test as the comparison arm, so "the number looks
 * fine" is never the evidence.
 */

const spec = loadAircraftSpec('f6f-hellcat')
const CRIT_DEG = (alphaCritRad(spec) * 180) / Math.PI
const NONE: AssistSettings = { stallLimiter: false, autoRudder: false }
const only = (assist: keyof AssistSettings): AssistSettings => ({ ...NONE, [assist]: true })
/**
 * Every assist on, stated explicitly.
 *
 * Cases about how a toggle or the hold's memory BEHAVES want a known starting
 * state, not the shipped one -- they are true whatever ships. Two of them read
 * `DEFAULT_ASSIST_SETTINGS` instead and so broke for an unrelated reason the
 * moment `altitudeHold` was switched off on 2026-09-15. The default's own
 * behaviour is pinned separately, at the bottom of this file.
 */
const ALL_ON: AssistSettings = { stallLimiter: true, autoRudder: true }

const keys = (...k: string[]) => new Set(k)

const start = (assists: AssistSettings, speed = 130, altitudeM = 2000): FrameState =>
  initialFrameState(
    spec,
    createState({ position: v3(0, altitudeM, 0), velocity: v3(speed, 0, 0), attitude: qIdentity() }),
    assists,
  )

/** `seconds` of real frames at 60 Hz with `held` down throughout. */
const fly = (from: FrameState, seconds: number, held: ReadonlySet<string>): FrameState => {
  let f = from
  for (let i = 0; i < Math.round(seconds * 60); i++) f = nextFrameState(f, 1 / 60, held)
  return f
}

/** One edge-triggered key press: down long enough to be seen, then released so
 *  the next press is a fresh edge. */
const tap = (from: FrameState, key: string): FrameState => fly(fly(from, 0.2, keys(key)), 0.2, keys())

/** Degrees, positive when the airflow comes from the right -- the same
 *  quantity `autoRudder` acts on (`src/assists/index.ts`), computed here from
 *  the state rather than imported, because the stage's internals are private. */
const sideslipDeg = (s: AircraftState): number => {
  if (length(s.velocity) < 1e-6) return 0
  const bodyRight = qRotate(s.attitude, v3(0, 0, 1))
  const d = dot(normalize(s.velocity), bodyRight)
  return (Math.asin(Math.max(-1, Math.min(1, d))) * 180) / Math.PI
}

const maxAlphaDegOver = (from: FrameState, seconds: number, held: ReadonlySet<string>): number => {
  let f = from
  let worst = -Infinity
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    f = nextFrameState(f, 1 / 60, held)
    const a = (angleOfAttack(f.world.aircraft) * 180) / Math.PI
    if (a > worst) worst = a
  }
  return worst
}

describe('the assists layer runs in the application (Plan 3 Task 5)', () => {
  it('auto-rudder reaches the simulation: a roll and recover ends less sideslipped, both directions', () => {
    // The design doc's own "test that would have caught a wrong sign" for this
    // assist, flown through the real frame path instead of through
    // `applyAssists`: roll hard for 3 s, centre for 4, measure what is left.
    // Measured 2026-09-13: 4.895 degrees off, 1.502 on, mirrored exactly
    // between the two roll directions. A wiring that passed no assist to
    // `advance` gives the OFF number in both arms, which is why the off arm is
    // flown here rather than quoted.
    //
    // RE-MEASURED 2026-09-17 at aero.cySlopePerRad 2.00 (it was 0.10 when the
    // numbers above were taken): 2.236 degrees off, 1.100 on, still mirrored.
    // The side force now does part of what only the auto-rudder used to do --
    // it bends the track toward the nose, so a roll-and-recover ends less
    // slipped even unassisted -- which is why both bounds below moved: the
    // "actually slipping" floor from 3 to 1.5, and the on/off ratio from a
    // half to 0.6 (measured 0.49, which cleared the old half by 1.6% -- too
    // thin for a bound whose job is to prove wiring, not tune a coefficient).
    for (const rollKey of ['ArrowRight', 'ArrowLeft']) {
      const off = fly(fly(start(NONE), 3, keys(rollKey, 'Equal')), 4, keys('Equal'))
      const on = fly(fly(start(only('autoRudder')), 3, keys(rollKey, 'Equal')), 4, keys('Equal'))
      const slipOff = Math.abs(sideslipDeg(off.world.aircraft))
      const slipOn = Math.abs(sideslipDeg(on.world.aircraft))
      // Bounded on both sides: an assist that ran but did nothing would leave
      // these equal, and `toBeLessThan` alone would also accept a difference
      // too small to be the real correction.
      expect(slipOff, `${rollKey}: the unassisted arm must actually be slipping`).toBeGreaterThan(1.5)
      expect(slipOn, rollKey).toBeLessThan(slipOff * 0.6)
    }
  })

  it('the stall limiter reaches the simulation: the pull that crosses alphaCrit without it does not with it', () => {
    // 130 m/s is the discriminating entry speed, and that is measured, not
    // assumed: at 180 m/s the same 8 s of full back stick peaks at 12.81
    // degrees UNASSISTED, below the 15.5-degree boundary, so it would pass
    // this test with the limiter dead. At 130 m/s unassisted reaches 15.85 --
    // past the boundary -- and 12.42 with the limiter on (measured
    // 2026-09-13 through this exact path).
    const held = keys('ArrowDown', 'Equal')
    const off = maxAlphaDegOver(start(NONE, 130), 8, held)
    const on = maxAlphaDegOver(start(only('stallLimiter'), 130), 8, held)
    expect(off, 'the unassisted pull must cross the boundary, or this test proves nothing').toBeGreaterThan(
      CRIT_DEG,
    )
    expect(on, 'full back stick with the limiter on must not cross it').toBeLessThan(CRIT_DEG)
  })


  it('runs the assist once per fixed step, so one long frame and several short ones agree exactly', () => {
    // Four steps in one frame against four frames of one step each, with the
    // assists live and DEFAULT_ASSIST_SETTINGS on. Bit-for-bit identical
    // (measured 2026-09-13), which it can only be if each step's assist saw
    // that step's own state: an assist hoisted out of `advance`'s loop would
    // evaluate once, on the frame's start state, and apply that one answer to
    // all four steps.
    //
    // Deliberately flown with NO keys held, and that is load-bearing rather
    // than incidental: `controlsFromKeys` ramps at FRAME rate (open item 5,
    // see `AdvanceResult.droppedSteps`), so with a key held the two arms would
    // legitimately differ for a reason that has nothing to do with the assist.
    // From NEUTRAL with nothing pressed the ramp is a no-op, which isolates
    // the assist path. `sim/loop.ts`'s own spy test owns the direct
    // once-per-step proof; this one owns it from the production caller.
    const oneLongFrame = nextFrameState(start(DEFAULT_ASSIST_SETTINGS), DT * 4, keys())
    let fourShortFrames = start(DEFAULT_ASSIST_SETTINGS)
    for (let i = 0; i < 4; i++) fourShortFrames = nextFrameState(fourShortFrames, DT, keys())

    expect(oneLongFrame.stepsRun, 'sanity: the long frame must really be multi-step').toBe(4)
    expect(oneLongFrame.world.aircraft).toEqual(fourShortFrames.world.aircraft)
    // Compares the AIRCRAFT, not the assist memory. It compared the memory
    // until 2026-09-17, when altitude hold -- the only stateful assist -- was
    // deleted; `assistMemory` is now `undefined` on both sides and would make
    // this pass without testing anything. The claim is that the assist runs
    // once per fixed step, and the resulting state is what shows that.
    expect(oneLongFrame.world.aircraft).toEqual(fourShortFrames.world.aircraft)
  })
})

describe('assist toggles (Plan 3 Task 5)', () => {
  it('flips one assist per key press, on the rising edge, leaving the other alone', () => {
    // Edge-triggered for the same reason the camera cycle is: held for a
    // second at 60 Hz, a per-frame toggle would flip sixty times and land
    // wherever the frame count left it. Each key is checked against the OTHER
    // two flags as well, so a toggle wired to the wrong field cannot pass.
    const cases = [
      { key: 'KeyL', assist: 'stallLimiter' },
      { key: 'KeyR', assist: 'autoRudder' },
    ] as const

    for (const { key, assist } of cases) {
      const held = fly(start(ALL_ON), 1, keys(key))
      expect(held.assists[assist], `${key} held for a second`).toBe(false)
      for (const other of ['stallLimiter', 'autoRudder'] as const) {
        if (other === assist) continue
        expect(held.assists[other], `${key} must not touch ${other}`).toBe(true)
      }
      // A second press flips it back: the toggle is a toggle, not a one-way
      // switch, and the release between the two presses is what re-arms it.
      const pressedAgain = tap(fly(held, 0.2, keys()), key)
      expect(pressedAgain.assists[assist], `${key} pressed a second time`).toBe(true)
    }
  })

  it('a toggle key reaches the simulation, not just the flag', () => {
    // The flag test above would pass if `assists` were a decoration nothing
    // read. This flies the identical 8 s of full back stick from the shipped
    // defaults, once as-is and once after a single tap of KeyL, and requires
    // the airplane to behave differently: 12.42 degrees of peak alpha with
    // the limiter on, 15.93 -- past the 15.5-degree boundary -- with it toggled
    // off (measured 2026-09-13). Same spawn, same keys, same duration; the tap
    // is the only difference.
    const held = keys('ArrowDown', 'Equal')
    const defaults = maxAlphaDegOver(start(DEFAULT_ASSIST_SETTINGS, 130), 8, held)
    const toggledOff = maxAlphaDegOver(tap(start(DEFAULT_ASSIST_SETTINGS, 130), 'KeyL'), 8, held)
    expect(defaults).toBeLessThan(CRIT_DEG)
    expect(toggledOff, 'KeyL did not reach the simulation').toBeGreaterThan(CRIT_DEG)
  })

})

describe('the engine-off default (2026-09-15)', () => {
  it('descends with the throttle closed, rather than holding altitude forever', () => {
    // Mark flew the page-load state on 2026-09-15 and reported an airplane
    // that "seems like it would fly forever" with the engine off. It was not a
    // physics fault: `altitudeHold` defaulted ON, so the hold traded speed for
    // altitude while the stall limiter kept it from departing, and the two
    // together mushed along level indefinitely at zero thrust.
    //
    // This flies the ACTUAL page-load condition -- `DEFAULT_ASSIST_SETTINGS`,
    // controls at NEUTRAL, so throttle 0 -- through the production frame path.
    //
    // Both arms were measured on 2026-09-15, from 2000 m at 130 m/s over 30 s:
    // 1.04 m lost with the hold on, 81.65 m with it off. The bound sits
    // between them at 50 m, a 48x margin over the held case and comfortably
    // under the gliding one, so it reads as "descends at all" rather than as a
    // tuned number that would need revisiting whenever drag changes. It is not
    // a glide-performance assertion: the airplane is not trimmed for best
    // glide and nothing here claims a lift-to-drag ratio.
    const startAltitude = 2000
    const after = fly(start(DEFAULT_ASSIST_SETTINGS, 130, startAltitude), 30, keys())
    const lost = startAltitude - after.world.aircraft.position.y

    expect(lost).toBeGreaterThan(50)
  })
})
