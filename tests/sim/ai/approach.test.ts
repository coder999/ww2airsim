import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../../tools/content/load.js'
import { worldFromScenario } from '../../../src/sim/scenario.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { createState, DT } from '../../../src/sim/flight/model.js'
import { MAX_SUPPORTED_SINK_MPS } from '../../../src/sim/ground.js'
import { deckOf, deckLocal } from '../../../src/sim/world/deck.js'
import { approachControls, carrierApproachProfile, DEFAULT_GLIDE_PATH_RAD } from '../../../src/sim/ai/approach.js'
import { paddlesCue, type PaddlesCue } from '../../../src/sim/paddles.js'
import { v3, sub, length } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

const f6f = loadAircraftSpec('f6f-hellcat')

describe('the carrier approach profile (7g spec §5)', () => {
  it('defaults reproduce the runway profile exactly', () => {
    const state = createState({ position: v3(0, 200, 4000), velocity: v3(0, -2.5, -49), gearFraction: 1, flapFraction: 1 })
    const base = { aimX: 0, aimZ: 0, runwayHeadingRad: 0, touchdownElevationM: 0 }
    expect(approachControls(f6f, state, { ...base, glidePathRad: DEFAULT_GLIDE_PATH_RAD }))
      .toEqual(approachControls(f6f, state, base))
  })

  it('flies the LSO numbers onto the deck: no wave-off before the cut, a trap in the zone, a supported sink', () => {
    // deck-quals, terrain null: the deck is the only ground this test needs.
    let world: World<undefined> = worldFromScenario(loadScenarioBundle('deck-quals'), null)
    const cv = world.ships.find((s) => s.id === 'cv-1')!
    const deck0 = deckOf(cv)!
    const wind = world.wind!
    const profile0 = carrierApproachProfile(f6f, deck0, cv.spec.paddles!)
    const along = v3(Math.sin(deck0.headingRad), 0, -Math.cos(deck0.headingRad))
    const start = { x: profile0.aimX - along.x * 4000, z: profile0.aimZ - along.z * 4000 }
    world = withAircraftState(world, world.player, createState({
      position: v3(start.x, deck0.center.y + f6f.gear.heightM + 4000 * Math.tan(profile0.glidePathRad), start.z),
      velocity: v3(along.x * (profile0.approachSpeedMps + 7.717), 0, along.z * (profile0.approachSpeedMps + 7.717)),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck0.headingRad),
      gearFraction: 1, flapFraction: 1,
    }))
    world = { ...world, aircraft: world.aircraft.map((a) => (a.id === world.player ? { ...a, parked: false } : a)) }
    const cues: PaddlesCue[] = []
    let sink: number | null = null
    let stopped = false
    for (let i = 0; i < 60 * 300 && !stopped; i++) {
      const before = playerAircraft(world).state
      const deck = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const controls = approachControls(f6f, before, { ...carrierApproachProfile(f6f, deck, cv.spec.paddles!), windVelocity: wind })
      const cue = paddlesCue(f6f, before, controls, deck, cv.spec.paddles!, wind)
      if (cue !== null) cues.push(cue)
      world = advance(withControls(world, world.player, controls), DT).world
      const now = playerAircraft(world).state
      expect(playerAircraft(world).impact, `crashed at tick ${now.tick}`).toBeNull()
      const deckNow = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
      const wheels = now.position.y - f6f.gear.heightM - deckNow.center.y
      if (sink === null && wheels < 0.05) sink = -(before.velocity.y - deckNow.velocity.y)
      stopped = now.arrested && length(sub(now.velocity, deckNow.velocity)) < 1
    }
    const firstCut = cues.indexOf('cut')
    const firstWaveOff = cues.indexOf('wave-off')
    expect(firstCut, 'the LSO never gave the cut').toBeGreaterThanOrEqual(0)
    expect(firstWaveOff === -1 || firstWaveOff > firstCut, `wave-off at cue ${firstWaveOff} before the cut at ${firstCut}`).toBe(true)
    expect(stopped, 'never trapped').toBe(true)
    expect(sink!).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    const deckEnd = deckOf(world.ships.find((s) => s.id === 'cv-1')!)!
    const rest = deckLocal(deckEnd, playerAircraft(world).state.position.x, playerAircraft(world).state.position.z)
    const fromStern = rest.z + deckEnd.lengthM / 2
    expect(fromStern).toBeGreaterThan(deckEnd.trapFromSternM)
    expect(fromStern).toBeLessThan(deckEnd.trapToSternM + 40)
  })
})
