import { describe, it, expect } from 'vitest'
import { initialFrameState, nextFrameState, acknowledgeLanding, type FrameState } from '../../src/render/frame.js'
import { nextLandingTracking, NO_LANDING, AIRBORNE_LATCH_M, LANDED_SPEED_MPS } from '../../src/sim/landing.js'
import { landingModel } from '../../src/render/debrief.js'
import { zeroKillsByType } from '../../src/sim/weapons/targetType.js'
import { playerAircraft, withAircraftState } from '../../src/sim/loop.js'
import { loadAircraftSpec, loadAirfield } from '../../tools/content/load.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import type { Deck } from '../../src/sim/world/deck.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const FRAME = 1 / 60

/** A flat field 100 m up over the whole world, the same shape
 *  `tests/sim/terrainContact.test.ts` builds its plateau with. */
const FIELD_M = 100
const field = createTerrainField(
  parseTerrainHeader({
    centreLatDeg: 10.8,
    centreLonDeg: 125.3,
    halfExtentM: 100000,
    finestSamples: 8193,
    levels: 13,
    encoding: 'int16-decimetres',
  }),
  12,
  new Int16Array(9).fill(FIELD_M * 10),
)

/** On its wheels on the field, gear down, at `speed` along +x. */
const onWheels = (speed: number, x = 0): AircraftState =>
  createState({
    position: v3(x, FIELD_M + f6f.gear.heightM, 0),
    velocity: v3(speed, 0, 0),
    attitude: qIdentity(),
    gearFraction: 1,
    flapFraction: 1,
  })
/** In the air, `wheelHeight` above the field, gear down. */
const flying = (wheelHeight: number, speed = 45, sink = 0): AircraftState =>
  createState({
    position: v3(0, FIELD_M + f6f.gear.heightM + wheelHeight, 0),
    velocity: v3(speed, -sink, 0),
    attitude: qIdentity(),
    gearFraction: 1,
    flapFraction: 1,
  })

/** Mark, 2026-09-17: "when I successfully land, it should prompt the overlay
 *  screen (like the crash screen) -- successful landing - nice job!". */
describe('landing tracking', () => {
  it('latches airborne only once the wheels are clear of the ground by the margin', () => {
    const low = nextLandingTracking(f6f, NO_LANDING, flying(0), flying(AIRBORNE_LATCH_M / 2), field, [])
    expect(low.airborne).toBe(false)
    const high = nextLandingTracking(f6f, low, flying(AIRBORNE_LATCH_M / 2), flying(AIRBORNE_LATCH_M + 1), field, [])
    expect(high.airborne).toBe(true)
  })

  it('records the touchdown on the first supported contact after being airborne', () => {
    const up = nextLandingTracking(f6f, NO_LANDING, flying(50), flying(50), field, [])
    const settling = flying(0.5, 40, 1.2)
    const t = nextLandingTracking(f6f, up, settling, onWheels(40), field, [])
    expect(t.touchdown).not.toBeNull()
    expect(t.touchdown!.sinkMps).toBeCloseTo(1.2, 6)
    expect(t.touchdown!.speedMps).toBeCloseTo(Math.hypot(40, 1.2), 6)
    expect(t.report).toBeNull()
  })

  it('reports the landing once the airplane has come to rest on its wheels', () => {
    let t = nextLandingTracking(f6f, NO_LANDING, flying(50), flying(50), field, [])
    t = nextLandingTracking(f6f, t, flying(0.5, 40, 1.0), onWheels(40), field, [])
    t = nextLandingTracking(f6f, t, onWheels(40), onWheels(20, 300), field, [])
    expect(t.report).toBeNull()
    t = nextLandingTracking(f6f, t, onWheels(20, 300), onWheels(LANDED_SPEED_MPS / 2, 600), field, [])
    expect(t.report).not.toBeNull()
    expect(t.report!.touchdownSinkMps).toBeCloseTo(1.0, 6)
    expect(t.report!.rollOutM).toBeCloseTo(600, 6)
  })

  it('never reports a landing for an airplane that was spawned parked and never flew', () => {
    let t = NO_LANDING
    for (let i = 0; i < 10; i++) t = nextLandingTracking(f6f, t, onWheels(0), onWheels(0), field, [])
    expect(t.airborne).toBe(false)
    expect(t.report).toBeNull()
  })

  it('forgets a touchdown on a go-around, so the next landing is the one reported', () => {
    let t = nextLandingTracking(f6f, NO_LANDING, flying(50), flying(50), field, [])
    t = nextLandingTracking(f6f, t, flying(0.5, 40, 3.0), onWheels(40), field, [])
    expect(t.touchdown).not.toBeNull()
    t = nextLandingTracking(f6f, t, onWheels(40), flying(AIRBORNE_LATCH_M + 1), field, [])
    expect(t.touchdown).toBeNull()
    expect(t.airborne).toBe(true)
    t = nextLandingTracking(f6f, t, flying(0.5, 40, 0.8), onWheels(40), field, [])
    expect(t.touchdown!.sinkMps).toBeCloseTo(0.8, 6)
  })

  it('does nothing without terrain', () => {
    const t = nextLandingTracking(f6f, NO_LANDING, flying(50), flying(50), null, [])
    expect(t).toBe(NO_LANDING)
  })

  it('is threaded through the frame, and Continue clears it and resumes', () => {
    // The same wired-vs-unwired hazard `frameAssists.test.ts` exists for: the
    // module can be perfect and the frame can still never call it.
    let f: FrameState = initialFrameState(f6f, flying(50), undefined, field)
    f = nextFrameState(f, FRAME, keys())
    expect(f.landing.airborne).toBe(true)
    // Drop the airplane a metre above the field, sinking, and let the
    // simulation itself make the contact: the tracking compares the world on
    // either side of a frame's steps, so the transition has to be stepped,
    // not injected. (Flying a whole landing is `tests/sim/landing.test.ts`'s
    // job, not this file's.)
    // 0.4 m up (above the 0.25 m contact tolerance, so the before-state is
    // unsupported) sinking at 2 m/s: with lift well short of weight at 30 m/s
    // the sink grows on the way down, and from a metre it would arrive past
    // the 4 m/s gate and be a crash rather than a landing.
    const low = flying(0.4, 30, 2.0)
    f = { ...f, world: withAircraftState(f.world, f.world.player, low) }
    for (let i = 0; i < 120 && f.landing.touchdown === null; i++) f = nextFrameState(f, FRAME, keys())
    expect(playerAircraft(f.world).impact, 'arrived too hard to be a landing').toBeNull()
    expect(f.landing.touchdown).not.toBeNull()
    expect(f.landing.report).toBeNull()
    // Then at rest on its wheels, which CAN be injected: the report needs
    // only the after-state to be supported and slow.
    const rest = onWheels(0, 500)
    f = { ...f, world: withAircraftState(f.world, f.world.player, rest) }
    f = nextFrameState(f, FRAME, keys())
    expect(f.landing.report).not.toBeNull()
    expect(f.landing.report!.rollOutM).toBeGreaterThan(400)
    const cleared = acknowledgeLanding({ ...f, paused: true })
    expect(cleared.landing).toBe(NO_LANDING)
    expect(cleared.paused).toBe(false)
  })

  it('names the airfield the touchdown point lies inside, or null off-field', () => {
    const tacloban = loadAirfield('tacloban')
    const c = tacloban.runway.center
    const at = (x: number, z: number, h: number, vy = 0, vx = 30): AircraftState =>
      createState({ position: v3(x, FIELD_M + f6f.gear.heightM + h, z), velocity: v3(vx, vy, 0), gearFraction: 1 })
    const airborne = nextLandingTracking(f6f, NO_LANDING, at(c.x, c.z, 50), at(c.x, c.z, 50), field, [tacloban])
    const touched = nextLandingTracking(f6f, airborne, at(c.x, c.z, 5, -1), at(c.x, c.z, 0, -1), field, [tacloban])
    const stopped = nextLandingTracking(f6f, touched, at(c.x, c.z, 0, 0, 0.5), at(c.x, c.z, 0, 0, 0.5), field, [tacloban])
    expect(stopped.report?.at).toEqual({ kind: 'airfield', id: 'tacloban', name: 'Tacloban' })

    const offAirborne = nextLandingTracking(f6f, NO_LANDING, at(0, 0, 50), at(0, 0, 50), field, [tacloban])
    const offTouched = nextLandingTracking(f6f, offAirborne, at(0, 0, 5, -1), at(0, 0, 0, -1), field, [tacloban])
    const offStopped = nextLandingTracking(f6f, offTouched, at(0, 0, 0, 0, 0.5), at(0, 0, 0, 0, 0.5), field, [tacloban])
    expect(offStopped.report?.at).toBeNull()
  })
})

describe('the landing debrief', () => {
  it('congratulates the pilot and shows the touchdown figures', () => {
    const m = landingModel(
      { touchdownSinkMps: 1.35, touchdownSpeedMps: 37.7, rollOutM: 583, tick: 6600, at: { kind: 'airfield', id: 'tacloban', name: 'Tacloban' } },
      zeroKillsByType(),
    )
    expect(m.headline).toBe('LANDED')
    expect(m.detail.toLowerCase()).toContain('nice')
    const labels = m.figures.map((x) => x.label)
    expect(labels).toContain('Touchdown sink')
    expect(labels).toContain('Touchdown speed')
    expect(labels).toContain('Roll-out')
    expect(m.figures.find((x) => x.label === 'Touchdown speed')!.value).toContain('mph')
    expect(m.continueLabel).toBeDefined()
  })
})


it('credits a carrier only when touchdown and rest belong to the same ship', () => {
  const deck: Deck = {
    shipId: 'cv-1', center: v3(0, FIELD_M, 0), headingRad: 0,
    lengthM: 262.7, widthM: 32.9, velocity: v3(0, 0, 0),
    yawRateRadPerS: 0, trapFromSternM: 30, trapToSternM: 130,
  }
  const tracking = {
    airborne: true, report: null,
    touchdown: { sinkMps: 1, speedMps: 30, x: 0, z: 0, tick: 1, deck },
  }
  const stopped = onWheels(0)
  const same = nextLandingTracking(f6f, tracking, stopped, stopped, null, [], [deck])
  expect(same.report!.at).toEqual({ kind: 'carrier', id: 'cv-1', name: 'cv-1' })
  const other = nextLandingTracking(f6f, tracking, stopped, stopped, null, [], [{ ...deck, shipId: 'cv-2' }])
  expect(other.report).not.toBeNull()
  expect(other.report!.at).toBeNull()
})
