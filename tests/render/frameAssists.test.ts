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
const NONE: AssistSettings = { stallLimiter: false, autoRudder: false, altitudeHold: false }
const only = (assist: keyof AssistSettings): AssistSettings => ({ ...NONE, [assist]: true })

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
    for (const rollKey of ['ArrowRight', 'ArrowLeft']) {
      const off = fly(fly(start(NONE), 3, keys(rollKey, 'ShiftLeft')), 4, keys('ShiftLeft'))
      const on = fly(fly(start(only('autoRudder')), 3, keys(rollKey, 'ShiftLeft')), 4, keys('ShiftLeft'))
      const slipOff = Math.abs(sideslipDeg(off.world.aircraft))
      const slipOn = Math.abs(sideslipDeg(on.world.aircraft))
      // Bounded on both sides: an assist that ran but did nothing would leave
      // these equal, and `toBeLessThan` alone would also accept a difference
      // too small to be the real correction.
      expect(slipOff, `${rollKey}: the unassisted arm must actually be slipping`).toBeGreaterThan(3)
      expect(slipOn, rollKey).toBeLessThan(slipOff / 2)
    }
  })

  it('the stall limiter reaches the simulation: the pull that crosses alphaCrit without it does not with it', () => {
    // 130 m/s is the discriminating entry speed, and that is measured, not
    // assumed: at 180 m/s the same 8 s of full back stick peaks at 12.81
    // degrees UNASSISTED, below the 15.5-degree boundary, so it would pass
    // this test with the limiter dead. At 130 m/s unassisted reaches 15.85 --
    // past the boundary -- and 12.42 with the limiter on (measured
    // 2026-09-13 through this exact path).
    const held = keys('ArrowDown', 'ShiftLeft')
    const off = maxAlphaDegOver(start(NONE, 130), 8, held)
    const on = maxAlphaDegOver(start(only('stallLimiter'), 130), 8, held)
    expect(off, 'the unassisted pull must cross the boundary, or this test proves nothing').toBeGreaterThan(
      CRIT_DEG,
    )
    expect(on, 'full back stick with the limiter on must not cross it').toBeLessThan(CRIT_DEG)
  })

  it('altitude hold reaches the simulation, and its memory survives the frame boundary', () => {
    // The strongest of the three, because it fails for TWO independent wiring
    // defects: no assist passed to `advance` at all, and an assist memory
    // that is not threaded from frame to frame. The second one matters -- a
    // world rebuilt each frame from `NOT_HOLDING`
    // re-captures the aeroplane's current altitude every frame, so the target
    // can never disagree with where the aeroplane already is and the hold is
    // silently a no-op (`nextAltitudeHoldMemory`'s own doc comment names this
    // failure). Measured 2026-09-13: 81.1 m of drift with the assist off, 3.3 m
    // with it on, over the same 60 s at full throttle from 2000 m.
    const held = keys('ShiftLeft')
    const settle = (assists: AssistSettings) => fly(start(assists, 130), 2, held) // throttle to full
    const driftOver = (from: FrameState, seconds: number) => {
      let f = from
      let worst = 0
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        f = nextFrameState(f, 1 / 60, keys())
        worst = Math.max(worst, Math.abs(f.world.aircraft.position.y - 2000))
      }
      return { worst, final: f }
    }

    const off = driftOver(settle(NONE), 60)
    const on = driftOver(settle(only('altitudeHold')), 60)

    expect(off.worst, 'hands-off must actually drift, or there is nothing to hold').toBeGreaterThan(40)
    expect(on.worst, 'with the assist on it must hold').toBeLessThan(15)

    // The memory is pinned at the altitude captured on the FIRST centred step,
    // not re-captured as the aeroplane moves: the aeroplane has flown 62 s and
    // over 8 km by here, so a re-capturing implementation would show its
    // current altitude instead of the spawn's exact 2000.
    expect(on.final.world.assistMemory.heldAltitudeM).toBe(2000)
    // And with the assist off the layer holds no target at all -- switched off
    // means forgotten, so re-enabling captures afresh (asserted below).
    expect(off.final.world.assistMemory.heldAltitudeM).toBeNull()
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
    expect(oneLongFrame.world.assistMemory).toEqual(fourShortFrames.world.assistMemory)
  })
})

describe('assist toggles (Plan 3 Task 5)', () => {
  it('flips one assist per key press, on the rising edge, leaving the other two alone', () => {
    // Edge-triggered for the same reason the camera cycle is: held for a
    // second at 60 Hz, a per-frame toggle would flip sixty times and land
    // wherever the frame count left it. Each key is checked against the OTHER
    // two flags as well, so a toggle wired to the wrong field cannot pass.
    const cases = [
      { key: 'KeyL', assist: 'stallLimiter' },
      { key: 'KeyR', assist: 'autoRudder' },
      { key: 'KeyH', assist: 'altitudeHold' },
    ] as const

    for (const { key, assist } of cases) {
      const held = fly(start(DEFAULT_ASSIST_SETTINGS), 1, keys(key))
      expect(held.assists[assist], `${key} held for a second`).toBe(false)
      for (const other of ['stallLimiter', 'autoRudder', 'altitudeHold'] as const) {
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
    // the aeroplane to behave differently: 12.42 degrees of peak alpha with
    // the limiter on, 15.93 -- past the 15.5-degree boundary -- with it toggled
    // off (measured 2026-09-13). Same spawn, same keys, same duration; the tap
    // is the only difference.
    const held = keys('ArrowDown', 'ShiftLeft')
    const defaults = maxAlphaDegOver(start(DEFAULT_ASSIST_SETTINGS, 130), 8, held)
    const toggledOff = maxAlphaDegOver(tap(start(DEFAULT_ASSIST_SETTINGS, 130), 'KeyL'), 8, held)
    expect(defaults).toBeLessThan(CRIT_DEG)
    expect(toggledOff, 'KeyL did not reach the simulation').toBeGreaterThan(CRIT_DEG)
  })

  it('turning altitude hold off forgets the captured altitude; turning it back on captures where the aeroplane is now', () => {
    // Switched off has to mean forgotten. Otherwise a pilot who turns the
    // assist off at 2000 m, descends a kilometre with the stick centred (so
    // nothing ever clears the memory) and turns it back on gets an immediate
    // climb command back to an altitude they deliberately left -- a stale
    // target reasserting itself, the same failure the "yield to pilot pitch
    // input" rule exists to prevent.
    const captured = fly(start(DEFAULT_ASSIST_SETTINGS, 130), 2, keys('ShiftLeft'))
    expect(captured.world.assistMemory.heldAltitudeM).toBe(2000)

    const switchedOff = tap(captured, 'KeyH')
    expect(switchedOff.assists.altitudeHold).toBe(false)
    expect(switchedOff.world.assistMemory.heldAltitudeM, 'off must forget').toBeNull()

    // Nose down for 20 s, then centre: the stick is centred again at the end,
    // so a memory that had merely been kept warm would still say 2000.
    const lower = fly(fly(switchedOff, 20, keys('ArrowUp')), 5, keys())
    const nowM = lower.world.aircraft.position.y
    expect(nowM, 'the descent must be unmistakable').toBeLessThan(1500)

    const switchedOn = tap(lower, 'KeyH')
    expect(switchedOn.assists.altitudeHold).toBe(true)
    const held = switchedOn.world.assistMemory.heldAltitudeM
    expect(held, 're-enabling must capture, not resume').not.toBeNull()
    // Within a few metres of where the aeroplane actually is, and nowhere near
    // the 2000 m it left -- and it must then HOLD that new altitude, which is
    // what tells a real re-capture from a memory that merely got zeroed.
    expect(Math.abs(held! - nowM)).toBeLessThan(20)
    const after = fly(switchedOn, 30, keys())
    expect(Math.abs(after.world.aircraft.position.y - held!)).toBeLessThan(15)
  })
})
