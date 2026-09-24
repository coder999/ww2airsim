import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../src/render/content.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { worldFromScenario } from '../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../src/sim/loop.js'
import { createState, DT } from '../../src/sim/flight/model.js'
import { MAX_SUPPORTED_SINK_MPS } from '../../src/sim/ground.js'
import { deckOf, deckWorld, deckLocal, decksOf } from '../../src/sim/world/deck.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../tools/autopilot/approach.js'
import { nextLandingTracking, NO_LANDING } from '../../src/render/landing.js'
import { paddlesCue, type PaddlesCue } from '../../src/sim/paddles.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'

/** The level a real page load actually flies over today -- see
 *  `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` for what it is and why.
 *  Before Task 2 (2026-09-24) this used `FIRST_COMMITTED_LEVEL`,
 *  numerically the same thing (2) at the time; the two concepts have since
 *  diverged ("what's committed on disk", now 0, vs "what a page load
 *  fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)
const f6f = loadAircraftSpec('f6f-hellcat')

describe('an approach flown to the moving deck (Plan 8)', () => {
  it('traps: hook down, inside the zone, within the ashore gates, and comes to rest relative to the deck', () => {
    const header = loadTerrainHeader()
    const terrain = createTerrainField(header, GROUND_TRUTH_LEVEL, loadTerrainLevel(GROUND_TRUTH_LEVEL, header))
    const bundle = loadScenarioBundle('deck-quals')
    let world: World<undefined> = worldFromScenario(bundle, terrain)
    const cv = world.ships.find((s) => s.id === 'cv-1')!
    const deck0 = deckOf(cv)!
    const wind = world.wind
    // The wind over the deck is the whole point of this case -- it is what
    // separates the airspeed the wing needs from the closure the geometry is
    // in -- so assert it rather than trusting the scenario to still carry it:
    // 7.717 m/s of ship steaming into a 7.717 m/s wind is 15.4 m/s.
    expect(wind, 'the deck-quals scenario has no wind').not.toBeNull()
    expect(length(sub(deck0.velocity, wind!))).toBeCloseTo(15.434, 3)

    // Start 4 km astern on the deck's heading, on a 3.5 degree slope to the aim point, at vref plus the ship's speed.
    const APPROACH_M = 4000
    /**
     * Aim at the NEAR edge of the trap zone -- `trapFromSternM`, 30 m up the
     * deck -- and not at the zone's center, because this autopilot's flare
     * floats and the deck is short enough for that to matter. Measured
     * 2026-09-19 at this carrier's 34.6 m/s of closure: the wheels go down
     * 67 m past the aim point. Aiming at the zone center (80 m from the
     * stern) put them down 147 m from the stern -- 17 m PAST the last wire,
     * where nothing engages and the airplane merely braked to a stop 211 m
     * up the deck. Aiming 50 m further aft lands it among the wires.
     */
    const aimLocalZ = -deck0.lengthM / 2 + deck0.trapFromSternM
    const startLocal = deckWorld(deck0, 0, aimLocalZ - APPROACH_M)
    const vref = VREF_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
    const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
    world = withAircraftState(world, world.player, createState({
      position: v3(startLocal.x, deck0.center.y + f6f.gear.heightM + APPROACH_M * Math.tan((3.5 * Math.PI) / 180), startLocal.z),
      velocity: v3(along.x * (vref + 7.717), 0, along.z * (vref + 7.717)),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
      gearFraction: 1,
      flapFraction: 1,
    }))
    world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }

    let tracking = NO_LANDING
    // The LSO's cue, collected every tick from the state and controls the
    // approach actually flew. Until this (Plan 8 review, item 4) `paddlesCue`
    // was observed only by its own unit test's fixtures -- nothing at any
    // tier ever ran it against a real approach, so a cue that never fired on
    // one would have passed the whole plan.
    const cues: PaddlesCue[] = []
    let touchdownSink: number | null = null
    let touchdownRel: number | null = null
    let stopped = false
    for (let i = 0; i < 60 * 300 && !stopped; i++) {
      const before = playerAircraft(world).state
      const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const aim = deckWorld(deck, 0, aimLocalZ)
      // Both frames, and they are NOT the same here: the ship makes 7.717 m/s
      // into a 7.717 m/s wind, so 15.4 m/s of wind over the deck separates
      // the airspeed the wing needs from the closure the geometry is in.
      const controls = approachControls(f6f, before, {
        aimX: aim.x, aimZ: aim.z, runwayHeadingRad: deck.headingRad,
        touchdownElevationM: deck.center.y, surfaceVelocity: deck.velocity,
        windVelocity: wind!, hookDown: true,
      })
      const cue = paddlesCue(f6f, before, controls, deck, cv.spec.paddles!, wind)
      if (cue !== null) cues.push(cue)
      world = advance(withControls(world, world.player, controls), DT).world
      const now = playerAircraft(world).state
      const deckNow = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      tracking = nextLandingTracking(f6f, tracking, before, now, terrain, world.airfields, decksOf(world.ships))
      if (tracking.touchdown !== null && touchdownSink === null) {
        touchdownSink = tracking.touchdown.sinkMps
        touchdownRel = tracking.touchdown.speedMps
      }
      expect(playerAircraft(world).impact, `crashed at tick ${now.tick}`).toBeNull()
      stopped = now.arrested && length(sub(now.velocity, deckNow.velocity)) < 1
    }
    const rest = playerAircraft(world).state
    const deckEnd = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const local = deckLocal(deckEnd, rest.position.x, rest.position.z)
    console.log(`carrier landing: touchdown sink ${touchdownSink?.toFixed(2)} m/s at ${touchdownRel?.toFixed(1)} m/s over the deck; at rest ${(local.z + deckEnd.lengthM / 2).toFixed(0)} m from the stern, ${local.x.toFixed(1)} m off the centerline`)
    const tally = [...new Set(cues)].map((c) => `${c} x${cues.filter((x) => x === c).length}`).join(', ')
    console.log(`paddles over the whole approach: ${tally}`)
    expect(touchdownSink, 'never touched down').not.toBeNull()
    expect(touchdownSink!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    expect(stopped, 'never trapped').toBe(true)
    expect(Math.abs(local.x)).toBeLessThan(deckEnd.widthM / 4)
    expect(local.z + deckEnd.lengthM / 2).toBeLessThan(deckEnd.trapToSternM + 40)
    expect(tracking.report).not.toBeNull()
    expect(tracking.report!.at).toEqual({ kind: 'carrier', name: 'cv-1' })
    expect(tracking.report!.rollOutM).toBeLessThan(60)
    // The paddles saw this approach and called the cut: an empty sequence
    // would mean the cue is unreachable in flight whatever its unit test says.
    expect(cues.length, 'the LSO never said anything on a complete approach').toBeGreaterThan(0)
    expect(cues).toContain('cut')
  })
})
