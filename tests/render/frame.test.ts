import { describe, it, expect } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  nextFrameState,
  initialFrameState,
  settleOnTerrain,
  toThreeOrientation,
  withTerrain,
  worldOffsetFor,
  airframeVisibilityFor,
} from '../../src/render/frame.js'
import { airspeed } from '../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle, qMul, qNormalize, qRotate } from '../../src/sim/math/quat.js'
import { createTerrainField, heightAt, SEA_LEVEL_M, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'
import { DEFAULT_SPAWN_POSITION, initialAircraftState } from '../../src/render/spawn.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const keys = (...k: string[]) => new Set(k)
const start = () =>
  initialFrameState(f6f, createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) }))

describe('nextFrameState', () => {
  it('advances the simulation and produces an eye transform', () => {
    const f = nextFrameState(start(), 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(1)
    expect(Number.isFinite(f.eye.position.x)).toBe(true)
  })

  it('routes held keys into the control vector the sim consumes', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('ArrowDown'))
    expect(f.controls.pitch).toBeGreaterThan(0.5)
  })

  it('cycles camera mode on a key edge, not on every frame it is held', () => {
    // Held for a second, a per-frame toggle would cycle 60 times and land
    // somewhere arbitrary.
    let f = start()
    const first = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(first)
    const afterHold = f.cameraMode
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).toBe(afterHold)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyC'))
    expect(f.cameraMode).not.toBe(afterHold)
  })

  it('survives a long stalled frame without spiralling or going non-finite', () => {
    let f = start()
    f = nextFrameState(f, 2.0, keys())
    expect(f.droppedSteps).toBeGreaterThan(0)
    expect(Number.isFinite(f.world.aircraft.position.y)).toBe(true)
    const after = nextFrameState(f, 1 / 60, keys())
    expect(after.stepsRun).toBe(1)
  })

  it('flies: throttle reaches the engine, so full power ends faster than idle', () => {
    // Starting at 120 m/s, position moves forward whatever the throttle does,
    // so distance alone proves nothing. Airspeed after five seconds does.
    let open = start()
    let idle = start()
    for (let i = 0; i < 300; i++) {
      open = nextFrameState(open, 1 / 60, keys('ShiftLeft'))
      idle = nextFrameState(idle, 1 / 60, keys())
    }
    expect(airspeed(open.world.aircraft)).toBeGreaterThan(airspeed(idle.world.aircraft) + 5)
  })

  it('exposes the interpolated pose strictly between the two most recent ticks', () => {
    // Task 13 review, round 1: `frame.ts` computed this pose and handed it to
    // `cameraTransformFor` but never exposed it, so main.ts had nothing to
    // pose the airframe mesh with and the airplane was never drawn. This
    // pins the fix: `render` must be the genuine interpolated midpoint, not
    // a pass-through of either endpoint.
    let f = start()
    f = nextFrameState(f, 1 / 60, keys()) // exactly one full step: alpha lands at 0
    f = nextFrameState(f, 1 / 60 / 2, keys()) // half a step banked: alpha = 0.5

    const { previous, aircraft } = f.world
    expect(previous.position.x).not.toBeCloseTo(aircraft.position.x, 3)
    const lo = Math.min(previous.position.x, aircraft.position.x)
    const hi = Math.max(previous.position.x, aircraft.position.x)
    expect(f.render.position.x).toBeGreaterThan(lo)
    expect(f.render.position.x).toBeLessThan(hi)
  })
})

describe('toThreeOrientation', () => {
  it('rotates a Three camera to look along the sim forward direction, not 90 degrees off it', () => {
    // Task 13 review, round 1, measured: copying the sim attitude straight
    // into `camera.quaternion` put the camera's forward at 90 degrees from
    // the flight direction, because sim body frame is +X-forward while a
    // Three camera looks down its own local -Z. This checks the fix against
    // Three's own quaternion/vector math, not just this project's qRotate,
    // since the review's finding was that the two agree bit-for-bit and the
    // bug was a missing basis rotation.
    const attitude = qNormalize(
      qMul(qFromAxisAngle(v3(0, 1, 0), 0.4), qFromAxisAngle(v3(0, 0, 1), 0.2)),
    )
    const threeQ = toThreeOrientation(attitude)
    const q = new Quaternion(threeQ.x, threeQ.y, threeQ.z, threeQ.w)
    const threeForward = new Vector3(0, 0, -1).applyQuaternion(q)

    const simForward = qRotate(attitude, v3(1, 0, 0))
    const dot =
      threeForward.x * simForward.x + threeForward.y * simForward.y + threeForward.z * simForward.z
    // dot of two unit vectors within 1 degree of each other exceeds cos(1deg).
    expect(dot).toBeGreaterThan(Math.cos(Math.PI / 180))
  })

  it('leaves an identity attitude looking along the sim forward axis, not out the left wing', () => {
    // A cheaper, exact version of the case above: identity attitude means
    // world-forward is exactly (1,0,0). The bug this guards against left the
    // camera looking along (0,0,-1) instead -- 90 degrees away, dot 0 exactly.
    const threeQ = toThreeOrientation(qNormalize({ x: 0, y: 0, z: 0, w: 1 }))
    const q = new Quaternion(threeQ.x, threeQ.y, threeQ.z, threeQ.w)
    const threeForward = new Vector3(0, 0, -1).applyQuaternion(q)
    expect(threeForward.x).toBeCloseTo(1, 9)
    expect(threeForward.y).toBeCloseTo(0, 9)
    expect(threeForward.z).toBeCloseTo(0, 9)
  })
})

describe('worldOffsetFor', () => {
  it('is the negation of the eye position, not the identity or the eye position itself', () => {
    // Pins the camera-relative convention itself (master spec §4): the world
    // translates by -eye and the camera stays at the origin, rather than the
    // equivalent-looking alternative of moving the camera to the eye. The two
    // render identically today (one aircraft, flat water) and are exactly
    // what this project's own review flagged as diverging once a second
    // reference frame -- terrain, a carrier deck -- exists.
    const offset = worldOffsetFor(v3(120, -40, 7))
    expect(offset).toEqual(v3(-120, 40, -7))
  })
})

describe('airframeVisibilityFor', () => {
  it('hides the airframe in cockpit mode and shows it in chase, in both directions', () => {
    // Both directions, or one of them regresses silently: the external
    // fuselage box would otherwise occlude the panel from inside cockpit
    // mode (see this function's doc comment for the measurement), and a
    // test only checking one mode would miss chase mode losing the
    // airframe just as easily.
    expect(airframeVisibilityFor('cockpit')).toEqual({ cockpitVisible: true, hellcatVisible: false })
    expect(airframeVisibilityFor('chase')).toEqual({ cockpitVisible: false, hellcatVisible: true })
  })
})

it('hands the frame and the world the same controls object', () => {
  // frame.ts documents `FrameState.controls` as "the identical object
  // `world.controls` holds". True, but untested: `nextFrameState` rebuilds
  // `{...prev.world, controls}` from `prev.controls` and never reads
  // `prev.world.controls`, so the render path would keep working while the
  // comment quietly became false (review 2026-09-13).
  const f6f = loadAircraftSpec('f6f-hellcat')
  let f = initialFrameState(f6f, createState({ position: v3(0, 600, 0), velocity: v3(120, 0, 0) }))
  expect(f.controls).toBe(f.world.controls)
  for (const keys of [new Set(['ArrowLeft']), new Set(['ShiftLeft']), new Set<string>()]) {
    f = nextFrameState(f, 1 / 60, keys)
    expect(f.controls).toBe(f.world.controls)
  }
})

describe('gear and brakes', () => {
  it('starts with the gear up when `initialFrameState` is not told this is a ground spawn', () => {
    // `start()` calls `initialFrameState` with no fifth argument, so it takes
    // the default `groundSpawn = false` -- matching every airborne spawn,
    // `start()`'s own (0, 1000, 0) included.
    expect(start().gearDown).toBe(false)
  })

  it('derives the gear default from the `groundSpawn` argument, not a literal', () => {
    // Task 14: `DEFAULT_SPAWN_POSITION` (src/render/spawn.ts) moved onto a
    // runway at Tacloban, which is exactly the failure mode the OLD hardcoded
    // `false` here used to warn about -- a spawn that changed out from under a
    // constant that did not track it. `gearDown` and `groundSpawn` now read
    // the SAME argument, so they cannot independently drift the way that
    // hardcoded literal did.
    const f = initialFrameState(f6f, createState({ position: v3(0, 2, 0), gearFraction: 1 }), undefined, undefined, true)
    expect(f.gearDown).toBe(true)
    expect(f.groundSpawn).toBe(true)
  })

  it('toggles the gear on the key edge, not every frame it is held', () => {
    let f = start()
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(true)
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(true)
    f = nextFrameState(f, 1 / 60, keys())
    f = nextFrameState(f, 1 / 60, keys('KeyG'))
    expect(f.gearDown).toBe(false)
  })

  it('puts the gear command where the simulation reads it', () => {
    // The Plan 3 defect: a control that never reaches `world.controls` is
    // inert in the browser while every unit test of it still passes.
    const f = nextFrameState(start(), 1 / 60, keys('KeyG'))
    expect(f.world.controls.gearDown).toBe(f.gearDown)
  })

  it('brakes while the key is held and releases when it is not', () => {
    const held = nextFrameState(start(), 1 / 60, keys('KeyB'))
    expect(held.controls.brake).toBeGreaterThan(0)
    expect(nextFrameState(held, 1 / 60, keys()).controls.brake).toBe(0)
  })
})

/**
 * A flat synthetic field, built the same way `tools/testcards/measure.ts`'s
 * `FLAT_SEA_LEVEL_FIELD` is: one coarse LOD level, every sample identical.
 * Good enough for the hold/settle mechanics below, which are about WHEN
 * `nextFrameState` is allowed to integrate, not about real terrain shape --
 * the take-off roll test further down uses the real committed field instead.
 */
const GROUND_HEIGHT_M = 2.0
const FLAT_FIELD: TerrainField = createTerrainField(
  parseTerrainHeader({
    centreLatDeg: 10.8,
    centreLonDeg: 125.3,
    halfExtentM: 100000,
    finestSamples: 8193,
    levels: 13,
    encoding: 'int16-decimetres',
  }),
  12,
  new Int16Array(9).fill(GROUND_HEIGHT_M * 10),
)

const groundStart = () =>
  initialFrameState(
    f6f,
    createState({ position: v3(0, GROUND_HEIGHT_M, 0), velocity: v3(0, 0, 0), gearFraction: 1 }),
    undefined,
    null,
    true,
  )

describe('ground spawn: the hold-for-terrain trap (Task 14)', () => {
  it('does not integrate while `groundSpawn` is true and `world.terrain` is null', () => {
    // The whole point: without this hold, a parked airplane free-falls from
    // its spawn altitude while terrain is still in flight over the network,
    // is metres underground by the time it lands, and is recorded destroyed
    // before the pilot has touched a key.
    let f = groundStart()
    for (let i = 0; i < 120; i++) f = nextFrameState(f, 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(0)
    expect(f.world.aircraft.position).toEqual(v3(0, GROUND_HEIGHT_M, 0))
    expect(f.stepsRun).toBe(0)
  })

  it('resumes integrating, settled rather than falling or buried, the instant terrain arrives', () => {
    let f = groundStart()
    for (let i = 0; i < 30; i++) f = nextFrameState(f, 1 / 60, keys()) // still holding
    expect(f.world.aircraft.tick).toBe(0)

    // `main.ts`'s own sequence: `withTerrain` first (the field lands), then
    // `settleOnTerrain` (correct the placeholder altitude). Settling alone
    // must not advance the clock or move anything but the vertical position.
    //
    // Task 15: `settleOnTerrain` now settles onto `GROUND_HEIGHT_M +
    // f6f.gear.heightM`, the wheels' contact point, not `GROUND_HEIGHT_M`
    // itself -- `position.y` is the body origin, which sits
    // `f6f.gear.heightM` above the ground once parked.
    f = settleOnTerrain(withTerrain(f, FLAT_FIELD), FLAT_FIELD)
    const contactHeightM = GROUND_HEIGHT_M + f6f.gear.heightM
    expect(f.world.aircraft.tick).toBe(0)
    expect(f.world.aircraft.position.x).toBe(0)
    expect(f.world.aircraft.position.z).toBe(0)
    expect(f.world.aircraft.position.y).toBeCloseTo(contactHeightM, 9)

    // Several seconds of sitting there, idle throttle: no impact, and never
    // more than a contact-tolerance width from the ground -- not falling
    // through, not buried, not snapped back up.
    for (let i = 0; i < 300; i++) f = nextFrameState(f, 1 / 60, keys())
    expect(f.world.impact).toBeNull()
    expect(Math.abs(f.world.aircraft.position.y - contactHeightM)).toBeLessThanOrEqual(GROUND_CONTACT_TOLERANCE_M)
    expect(f.world.aircraft.velocity.y).toBe(0)
  })

  it('never holds an airborne (non-ground) spawn, terrain or not', () => {
    // `start()` is `groundSpawn = false` -- the pre-Task-14 default -- so it
    // must integrate immediately even with no terrain at all, exactly as
    // every flight before this task did.
    const f = nextFrameState(start(), 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(1)
    expect(f.stepsRun).toBe(1)
  })
})

describe('take-off from the real Tacloban ground spawn (Task 14 verification)', () => {
  // 86.5 mph, the same trial take-off speed `tests/sim/testcards/f6f.test.ts`
  // grades `measureTakeoffRun` against -- reused here only as "has the
  // airplane built up flying speed", not as a second copy of that card.
  const TAKEOFF_SPEED_MPS = 86.5 * 0.44704

  it('holds, settles onto the real terrain, rolls and lifts off under full throttle', () => {
    // The committed L4 field -- the one level `physicsFieldFor` ever hands to
    // the physics (src/render/terrain/load.ts) -- loaded the same way
    // `tests/sim/soak.test.ts`'s terrain-contact soak does: this is a test,
    // not `src/sim/`, so pulling from `tools/terrain/load.ts` is fine here.
    const header = loadTerrainHeader()
    const heights = loadTerrainLevel(FIRST_COMMITTED_LEVEL, header)
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, heights)
    const groundHeightM = heightAt(terrain, DEFAULT_SPAWN_POSITION.x, DEFAULT_SPAWN_POSITION.z)

    // Real ground, well above sea level and well below "this is a mountain,
    // the coordinate is wrong" -- Tacloban is a coastal airfield.
    expect(groundHeightM).toBeGreaterThan(0)
    expect(groundHeightM).toBeLessThan(50)

    let f = initialFrameState(
      f6f,
      createState({
        position: v3(DEFAULT_SPAWN_POSITION.x, groundHeightM, DEFAULT_SPAWN_POSITION.z),
        velocity: v3(0, 0, 0),
        gearFraction: 1,
      }),
      undefined,
      null,
      true,
    )

    // Held for a stretch with no terrain, exactly like the real boot
    // sequence, before the field "arrives".
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys())
    expect(f.world.aircraft.tick).toBe(0)

    f = settleOnTerrain(withTerrain(f, terrain), terrain)
    // Task 15: settles onto the wheels' contact point, `groundHeightM +
    // f6f.gear.heightM`, not `groundHeightM` itself.
    const contactHeightM = groundHeightM + f6f.gear.heightM
    expect(f.world.aircraft.position.y).toBeCloseTo(contactHeightM, 9)

    const startX = f.world.aircraft.position.x
    const startZ = f.world.aircraft.position.z

    // Phase 1: full throttle, wheels level, pitch neutral -- exactly
    // `measureTakeoffRun`'s (tools/testcards/measure.ts) own technique --
    // until ground speed reaches the historical rotation speed. Unlike that
    // card, "rotation speed" here is not the finish line: reaching it with no
    // pitch input does not lift a level-attitude wing off real ground (the
    // wing is at ~0 angle of attack the whole roll), which is exactly why a
    // real pilot rotates at this speed rather than waiting for the runway to
    // run out.
    const ROLL_MAX_S = 30
    let rolling = true
    for (let i = 0; i < 60 * ROLL_MAX_S && rolling; i++) {
      f = nextFrameState(f, 1 / 60, keys('ShiftLeft'))
      expect(f.world.impact, `impact recorded during the ground roll, tick ${f.world.aircraft.tick}`).toBeNull()
      rolling = airspeed(f.world.aircraft) < TAKEOFF_SPEED_MPS
    }
    expect(airspeed(f.world.aircraft), 'never reached rotation speed').toBeGreaterThanOrEqual(TAKEOFF_SPEED_MPS)

    const rollDistanceM = Math.hypot(f.world.aircraft.position.x - startX, f.world.aircraft.position.z - startZ)

    // Phase 2: rotate -- hold nose-up for 1.5 s, matched to this airframe's
    // `rates.maxPitchRateDegPerSec`-scale response, then release to neutral
    // and let it fly itself off. A full, indefinitely-held deflection
    // over-rotates into a climbing stall and porpoises back into the water
    // (observed manually while building this test); a bounded rotation
    // input, released once commanded, is what an actual pilot does and is
    // what this asserts stays crash-free.
    const ROTATE_TICKS = 90
    for (let i = 0; i < ROTATE_TICKS; i++) {
      f = nextFrameState(f, 1 / 60, keys('ShiftLeft', 'ArrowDown'))
      expect(f.world.impact, `impact recorded while rotating, tick ${f.world.aircraft.tick}`).toBeNull()
    }

    // Phase 3: confirm genuine separation from the runway -- height above
    // the real ground clears contact tolerance and STAYS clear for a
    // sustained stretch, not one noisy tick -- within a further bounded
    // window, still crash-free throughout.
    const CLIMB_MAX_S = 15
    const SUSTAINED_TICKS = 30
    let clearTicks = 0
    let airborneTick: number | null = null
    for (let i = 0; i < 60 * CLIMB_MAX_S && airborneTick === null; i++) {
      f = nextFrameState(f, 1 / 60, keys('ShiftLeft'))
      expect(f.world.impact, `impact recorded during the climb-out, tick ${f.world.aircraft.tick}`).toBeNull()
      // Task 15: the WHEELS' height above ground is what "airborne" means --
      // `position.y` is the body origin, which sits `f6f.gear.heightM` above
      // the wheels even while parked, so that raw difference alone would read
      // as "airborne" from the very start of the roll.
      const heightAboveGroundM =
        f.world.aircraft.position.y -
        f6f.gear.heightM -
        heightAt(terrain, f.world.aircraft.position.x, f.world.aircraft.position.z)
      clearTicks = heightAboveGroundM > GROUND_CONTACT_TOLERANCE_M ? clearTicks + 1 : 0
      if (clearTicks >= SUSTAINED_TICKS) airborneTick = f.world.aircraft.tick
    }

    expect(airborneTick, 'did not get, and stay, airborne').not.toBeNull()
    // Reported, not pinned to a tolerance: this is a sanity check that the
    // real spawn, through the real render-layer wiring (hold, settle, gear
    // derivation), can actually roll and take off -- the graded historical
    // figure lives in f6f.test.ts, measured over synthetic flat ground on
    // purpose (a real-terrain grade would make a historical number depend on
    // which LOD level happened to load).
    console.log(
      `Task 14 verification: ground roll to rotation speed (${TAKEOFF_SPEED_MPS.toFixed(2)} m/s) was ${rollDistanceM.toFixed(1)} m from the Tacloban spawn`,
    )
    expect(rollDistanceM).toBeGreaterThan(0)
  })

  /**
   * Task 11: the spawn heading and the runway's axis are one decision, and
   * these two are its test from the physics end. `tests/render/spawn.test.ts`
   * asserts the quaternion; `tests/render/runway.test.ts` asserts the strip's
   * geometry; neither can see whether the airplane actually ROLLS down it.
   *
   * Both of these fail on the `qIdentity()` spawn attitude that shipped
   * before 2026-09-17, and they fail differently: the first because the roll
   * goes east, the second because east of Tacloban is San Pedro Bay.
   */
  const rollFromTheSpawn = (terrain: TerrainField) => {
    const groundHeightM = heightAt(terrain, DEFAULT_SPAWN_POSITION.x, DEFAULT_SPAWN_POSITION.z)
    let f = settleOnTerrain(
      withTerrain(
        initialFrameState(
          f6f,
          // The boot path's own constructor, not a hand-built state: the
          // heading under test is the one `main.ts` actually spawns with.
          initialAircraftState(v3(DEFAULT_SPAWN_POSITION.x, groundHeightM, DEFAULT_SPAWN_POSITION.z), true),
          undefined,
          terrain,
          true,
        ),
        terrain,
      ),
      terrain,
    )
    const from = f.world.aircraft.position
    const startX = from.x
    const startZ = from.z
    for (let i = 0; i < 60 * 30 && airspeed(f.world.aircraft) < TAKEOFF_SPEED_MPS; i++) {
      f = nextFrameState(f, 1 / 60, keys('ShiftLeft'))
      expect(f.world.impact, `impact recorded during the ground roll, tick ${f.world.aircraft.tick}`).toBeNull()
    }
    expect(airspeed(f.world.aircraft), 'never reached rotation speed').toBeGreaterThanOrEqual(TAKEOFF_SPEED_MPS)
    return { f, startX, startZ }
  }

  it('rolls north, down the strip, rather than east across it', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const { f, startX, startZ } = rollFromTheSpawn(terrain)

    const alongM = f.world.aircraft.position.z - startZ
    const acrossM = Math.abs(f.world.aircraft.position.x - startX)

    // North is +z. The roll must be overwhelmingly along that axis: the
    // airplane has no directional stability on the ground yet (Plan 11a's
    // handoff records a taxi turn reaching 113.6 deg of sideslip), so this is
    // deliberately a ratio rather than a tight bound on `acrossM`.
    expect(alongM).toBeGreaterThan(100)
    expect(acrossM).toBeLessThan(alongM / 10)
  })

  it('has land, not San Pedro Bay, off the departure end', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const { f } = rollFromTheSpawn(terrain)
    const at = f.world.aircraft.position

    // 900 m beyond the rotation point, sampled every 30 m. Measured
    // 2026-09-17 on this field: going north there is no sea-level sample
    // within 900 m of the spawn at all, while going east the first one is at
    // exactly 900 m -- and the roll to rotation is only ~450 m, so an
    // east-facing take-off cleared the coast by about half its own roll.
    for (let aheadM = 0; aheadM <= 900; aheadM += 30) {
      const h = heightAt(terrain, at.x, at.z + aheadM)
      expect(h, `sea ${aheadM} m beyond rotation`).toBeGreaterThan(SEA_LEVEL_M)
    }
  })
})

describe('the flap lever (Plan 11b Task 8)', () => {
  it('latches on an F press rather than flipping while it is held', () => {
    // Same edge-triggered shape as the gear: a lever that stays where it is
    // left, not a switch that flips 60 times a second.
    let f = start()
    expect(f.flapDown).toBe(false)
    for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
    expect(f.flapDown).toBe(true)
    for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys())
    expect(f.flapDown).toBe(true)
    for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
    expect(f.flapDown).toBe(false)
  })

  it('actually reaches the simulation, which is the Plan 3 defect this guards', () => {
    // Plan 3 shipped an assist that never reached `step` while its own unit
    // tests passed, because they called the module directly. A flap lever that
    // moved a `FrameState` field and nothing else would look identical.
    let f = start()
    for (let i = 0; i < 10; i++) f = nextFrameState(f, 1 / 60, keys('KeyF'))
    expect(f.controls.flapDown).toBe(true)
    const early = f.world.aircraft.flapFraction
    for (let i = 0; i < 60; i++) f = nextFrameState(f, 1 / 60, keys())
    expect(f.world.aircraft.flapFraction).toBeGreaterThan(early)
    expect(f.world.aircraft.flapFraction).toBeLessThanOrEqual(1)
  })

  it('starts with the flaps up, including on a parked spawn', () => {
    // A real airplane is not left with its flaps hanging out, and unlike the
    // gear there is no reason a parked spawn should differ.
    expect(initialFrameState(f6f, createState({}), undefined, null, true).flapDown).toBe(false)
    expect(initialFrameState(f6f, createState({})).flapDown).toBe(false)
  })
})
