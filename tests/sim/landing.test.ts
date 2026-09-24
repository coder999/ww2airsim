import { describe, it, expect } from 'vitest'
import { approachControls, VREF_STALL_MULTIPLE } from '../../tools/autopilot/approach.js'
import { advance, createWorld, playerAircraft, withControls, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { airspeed, DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor } from '../../src/render/content.js'
import { loadAircraftSpec, loadAirfield } from '../../tools/content/load.js'
import { nextLandingTracking, NO_LANDING } from '../../src/render/landing.js'
import {
  supportedContact,
  GROUND_CONTACT_TOLERANCE_M,
  MAX_SUPPORTED_SINK_MPS,
} from '../../src/sim/ground.js'

/** The level a real page load actually flies over today -- `main.ts`'s and
 *  `terrain/mesh.ts`'s own placeholder pending Task 6's real persisted-tier
 *  wiring (deliberately `'low'`, not the spec's eventual `'medium'` default;
 *  see those two files' own notes on why). Before Task 2 (2026-09-24) this
 *  file used `FIRST_COMMITTED_LEVEL`, numerically the same thing (2) at the
 *  time; the two concepts have since diverged ("what's committed on disk",
 *  now 0, vs "what a page load fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor('low')

const f6f = loadAircraftSpec('f6f-hellcat')

/**
 * Tacloban's strip, read from the record every part of the game now reads
 * (`content/bases/tacloban.json`) rather than restated as four literals here.
 *
 * It used to be four literals, with a comment saying `src/sim/` tests should
 * not reach into `src/render/` for them -- true, and no longer the choice on
 * offer: since Plan 12 the strip is content, and `tools/content/load.ts` is
 * the Node reader this file already uses for the aircraft spec. The
 * coordinate is still never re-derived (master spec §15; an equirectangular
 * back-of-envelope lands ~80 m away), and `tests/sim/world/airfields.test.ts`
 * is what pins it and the 1500 x 45 dimensions to their literals.
 */
const TACLOBAN = loadAirfield('tacloban')
const TACLOBAN_X = TACLOBAN.runway.center.x
const TACLOBAN_Z = TACLOBAN.runway.center.z
const RUNWAY_LENGTH_M = TACLOBAN.runway.lengthM
const RUNWAY_WIDTH_M = TACLOBAN.runway.widthM

/**
 * **This is the deliverable of Plan 11b.** The autopilot flies an approach
 * into Tacloban over the real committed heightfield, and the assertion is not
 * merely that it touched down but that it **came to rest on the strip** --
 * which is what the lateral tire force buys and what nothing previously
 * checked.
 *
 * Every piece of this is unit-tested in isolation elsewhere. That is not
 * enough, and 11a is the reason it is not: its soak assertions shipped
 * covering `supportedContact` on 0 of 417,539 ticks, and breaking the ground
 * constraint left the whole suite green.
 *
 * Measured 2026-09-17, first flown landing in this project:
 *
 * | Quantity | Value |
 * | --- | --- |
 * | touchdown sink | 1.47 m/s |
 * | touchdown speed | 38.4 m/s (full-flap stall is 37.77) |
 * | touchdown point | 568 m in from the approach end |
 * | worst sink on the approach | 3.95 m/s |
 * | came to rest | 60 m past the strip centre, 0.0 m off the centreline |
 *
 * The 0.0 m of lateral deviation is the lateral tire force (Task 7) doing its
 * job -- before it, a taxi turn reached 113.6 degrees of sideslip.
 *
 * RE-MEASURED 2026-09-17 after rate authority became proportional to speed
 * (`rateAuthority`, model.ts) and the approach autopilot's two pitch gains
 * were halved to match (`tools/autopilot/approach.ts`, `FLARE_PITCH_MAX`
 * says why): touchdown sink 1.35 m/s at 37.7 m/s, 583 m in, worst sink on
 * the approach 3.96 m/s, at rest 65 m past the strip centre and 0.0 m off
 * the centreline. With the gains left alone this case failed with the
 * airplane 269 m off the strip, which is exactly the kind of thing it exists
 * to catch.
 *
 * The worst sink figure is worth watching rather than asserting: 3.95 m/s is
 * the transient while the path is being established at 262 m, not an arrival
 * rate, and it sits just under `MAX_SUPPORTED_SINK_MPS`. It exceeds the
 * autopilot's own `MAX_APPROACH_SINK_MPS` of 3.0 because that clamp bounds the
 * TARGET sink, not the achieved one, and a proportional loop overshoots.
 */
describe('an approach flown into Tacloban', () => {
  it('touches down gently, tracks the strip, and comes to rest on it', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, GROUND_TRUTH_LEVEL, loadTerrainLevel(GROUND_TRUTH_LEVEL, header))
    const elevationM = heightAt(terrain, TACLOBAN_X, TACLOBAN_Z)
    // Aim a quarter of the way in from the approach end, leaving three
    // quarters of the strip to roll out on.
    const target = {
      aimX: TACLOBAN_X,
      aimZ: TACLOBAN_Z + RUNWAY_LENGTH_M / 4,
      runwayHeadingRad: 0,
      touchdownElevationM: elevationM,
    }

    const APPROACH_LENGTH_M = 5000
    const vrefMps = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
    // Lined up north, on a 3-degree path, at the speed the autopilot holds,
    // already configured -- the gear and flaps take seconds and this test is
    // about the landing, not about remembering to ask for them in time.
    // Explicitly typed: `World.terrain` is `TerrainField | null`, and letting
    // TypeScript infer this from the literal narrows it to non-null and then
    // rejects the reassignment below.
    let world: World<undefined> = {
      ...createWorld(
        f6f,
        createState({
          position: v3(
            TACLOBAN_X,
            elevationM + f6f.gear.heightM + APPROACH_LENGTH_M * Math.tan((3 * Math.PI) / 180),
            target.aimZ + APPROACH_LENGTH_M,
          ),
          velocity: v3(0, 0, -vrefMps),
          attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2),
          gearFraction: 1,
          flapFraction: 1,
        }),
        // `createWorld` requires controls. Omitting them stepped the whole
        // flight with `undefined` and produced a state that never moved --
        // caught by `tsc`, not by the test, which merely failed to land.
        { pitch: 0, roll: 0, yaw: 0, throttle: 0 },
      ),
      terrain,
    }

    let touchdownSinkMps: number | null = null
    let touchdownSpeedMps: number | null = null
    let touchdownZ: number | null = null
    let worstSinkMps = 0
    const MAX_S = 300
    let stopped = false

    // The landing report's airfield name (Task 6): run the render layer's
    // own tracking alongside the loop rather than reconstructing it from the
    // recorded states after the fact, so this is the SAME function the frame
    // calls in the browser, not a second implementation that could disagree.
    let tracking = NO_LANDING

    for (let i = 0; i < 60 * MAX_S && !stopped; i++) {
      const before = playerAircraft(world).state
      const wasSupported = supportedContact(f6f, before, heightAt(terrain, before.position.x, before.position.z))
      // `advance(world, elapsed, stepper?, assist?)` takes NO controls -- they
      // live on the aircraft entity (`withControls`) -- and it returns an
      // `AdvanceResult`.
      world = advance(withControls(world, world.player, approachControls(f6f, before, target)), DT).world
      const now = playerAircraft(world).state
      tracking = nextLandingTracking(f6f, tracking, before, now, terrain, [TACLOBAN])
      const nowSupported = supportedContact(f6f, now, heightAt(terrain, now.position.x, now.position.z))

      if (!wasSupported && nowSupported && touchdownSinkMps === null) {
        touchdownSinkMps = -before.velocity.y
        touchdownSpeedMps = airspeed(before)
        touchdownZ = now.position.z
      }
      worstSinkMps = Math.max(worstSinkMps, -now.velocity.y)
      expect(playerAircraft(world).impact, `crashed at tick ${now.tick}`).toBeNull()
      stopped = nowSupported && airspeed(now) < 1
    }

    const rest = playerAircraft(world).state
    console.log(
      `landing: touchdown sink ${touchdownSinkMps?.toFixed(2)} m/s at ${touchdownSpeedMps?.toFixed(1)} m/s, ` +
        `${touchdownZ === null ? 'n/a' : ((TACLOBAN_Z + RUNWAY_LENGTH_M / 2) - touchdownZ).toFixed(0)} m in from the ` +
        `approach end; worst sink on the approach ${worstSinkMps.toFixed(2)} m/s; ` +
        `came to rest ${(rest.position.z - TACLOBAN_Z).toFixed(0)} m from the strip centre, ` +
        `${(rest.position.x - TACLOBAN_X).toFixed(1)} m off the centreline`,
    )

    expect(touchdownSinkMps, 'never touched down').not.toBeNull()
    // Gentle enough that 11a's gates called it a landing rather than a crash.
    expect(touchdownSinkMps!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    expect(stopped, 'never came to rest').toBe(true)
    // Stopped ON the strip. A roll-out that slid off the side would pass a
    // sink-rate-only assertion while being no landing at all.
    expect(Math.abs(rest.position.x - TACLOBAN_X)).toBeLessThan(RUNWAY_WIDTH_M / 2)
    expect(Math.abs(rest.position.z - TACLOBAN_Z)).toBeLessThan(RUNWAY_LENGTH_M / 2)
    // Still on its wheels at rest, not resting on something else.
    const restGroundM = heightAt(terrain, rest.position.x, rest.position.z)
    expect(rest.position.y - f6f.gear.heightM - restGroundM).toBeLessThan(GROUND_CONTACT_TOLERANCE_M)

    expect(tracking.report, 'no landing report').not.toBeNull()
    expect(tracking.report!.at).toEqual({ kind: 'airfield', name: 'Tacloban' })

    // Plan 8 generalizes the autopilot to a heading frame and a moving target.
    // Tacloban's heading is 0, and rotating by zero must be exact, so these
    // figures are pinned EXACTLY, not within tolerance: any change means the
    // northbound path is no longer the code that measured them. vitest fills
    // the snapshot in on the first run and compares with `Object.is` after.
    expect({ touchdownSinkMps, touchdownSpeedMps, restX: rest.position.x, restZ: rest.position.z }).toMatchInlineSnapshot(`
      {
        "restX": -29666,
        "restZ": -47669.859457857216,
        "touchdownSinkMps": 1.348205395498573,
        "touchdownSpeedMps": 37.72712992030997,
      }
    `)
  })
})
