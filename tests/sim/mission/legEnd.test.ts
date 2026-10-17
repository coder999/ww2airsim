/**
 * F5C D2 (2026-10-16): the leg boundary. A full stop on a friendly airfield, carrier deck or anchorage ends a LEG, not
 * the sortie; the sim names the friendly base the flight stopped on (`MissionLogEntry` `landing.base`, `friendlyBaseAt`).
 * Touch-and-go and go-around never end a leg, nor does a stop on open ground, an enemy field or water away from every
 * anchorage. Flown headless through the same frame helpers the recovery-agreement test uses.
 */
import { describe, expect, it } from 'vitest'
import { initialFrameStateFor, nextFrameState, type FrameState } from '../../../src/render/frame.js'
import { friendlyBaseAt } from '../../../src/sim/friendly.js'
import { checkGroundStop } from '../../../src/sim/groundStop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { lastLanding } from '../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../src/sim/mission/outcome.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import { bundleForScenario, loadAircraftSpec, loadAirfield, loadScenarioBundle } from '../../../tools/content/load.js'
import { flatField } from './fixture.js'
import { FRAME, GEAR_M, NO_KEYS, frames, land, put } from './stopFixture.js'

const TAC = loadAirfield('tacloban').runway.center
const DULAG = loadAirfield('dulag').runway.center
const CV_1 = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[-25629, -16479]], speedMps: 0 }
const HOME = { id: 'home', label: 'Land at any friendly base', priority: 'primary', kind: 'land', at: 'tacloban', suggestedRecovery: true }

function frameFor(o: { ships?: unknown[]; airfields?: string[]; terrainM?: number; at?: { x: number; z: number } }): FrameState {
  const at = o.at ?? TAC
  const raw = {
    id: 'leg', player: 'f6f-1', airfields: o.airfields ?? ['tacloban'],
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [at.x, 500, at.z], headingDeg: 0, speedMps: 60 } }],
    ships: o.ships ?? [], weather: { windFromDeg: 0, windMps: 0 }, objectives: [HOME],
  }
  return initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(o.terrainM ?? 100)))
}

const baseOf = (f: FrameState) => friendlyBaseAt(f.world, f.landing.report!.at, playerAircraft(f.world).state.position)

describe('a full stop at a friendly base is a leg end', () => {
  it('an airfield: the report, the mission log and the shell\'s own question all name Tacloban', () => {
    const f = land(frameFor({}), TAC.x, 100, TAC.z)
    expect(baseOf(f)).toEqual({ kind: 'airfield', id: 'tacloban', name: 'Tacloban' })
    expect(lastLanding(f.world.mission!)).toMatchObject({ base: { kind: 'airfield', id: 'tacloban' }, advanced: 'home' })
    expect(checkGroundStop(f.world)).toMatchObject({ ok: true, placement: { kind: 'runway' } })
    // The suggested recovery was Tacloban here, but ANY friendly base completes it (D3); the world is intact, the player alive.
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).result).toBe('success')
    expect(f.world.mission!.progress[0]).toMatchObject({ status: 'complete' })
    expect(playerAircraft(f.world).impact).toBeNull()
  })

  it('a carrier deck', () => {
    const f0 = frameFor({ ships: [CV_1], terrainM: 0 })
    const deck = deckOf(f0.world.ships[0]!)!
    const p = deckWorld(deck, 0, 0)
    const f = land(f0, p.x, deck.center.y, p.z)
    expect(baseOf(f)).toMatchObject({ kind: 'carrier', id: 'cv-1' })
    expect(lastLanding(f.world.mission!)).toMatchObject({ base: { kind: 'carrier', id: 'cv-1' }, advanced: 'home' })
    expect(checkGroundStop(f.world)).toMatchObject({ ok: true, placement: { kind: 'carrier' } })
  })

  it('a friendly anchorage: a Catalina that comes to rest on San Pedro Bay', () => {
    const w = catalinaLanded(0)
    expect(w).not.toBeNull()
    const last = lastLanding(w!.mission!)!
    expect(last.at).toEqual({ kind: 'water', id: 'open-water', name: 'Open water' })
    expect(last.base).toMatchObject({ kind: 'anchorage', id: 'san-pedro-bay' })
    expect(checkGroundStop(w!)).toMatchObject({ ok: true, placement: { kind: 'water' } })
  })
})

describe('what never ends a leg', () => {
  it('open ground: a landing off every field names no base and the recovery is refused', () => {
    const f = land(frameFor({}), 0, 100, 0)
    expect(f.landing.report!.at).toBeNull()
    expect(baseOf(f)).toBeNull()
    expect(lastLanding(f.world.mission!)).toMatchObject({ base: null, advanced: null })
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).reasons[0]).toBe('Landed off-field')
    expect(checkGroundStop(f.world)).toEqual({ ok: false, reason: 'This is not a friendly base.' })
  })

  it('an enemy field: Dulag is a field, but not the player\'s', () => {
    const f = land(frameFor({ airfields: ['tacloban', 'dulag'], at: DULAG }), DULAG.x, 100, DULAG.z)
    expect(f.landing.report!.at).toMatchObject({ kind: 'airfield', id: 'dulag' })
    expect(baseOf(f)).toBeNull()
    expect(lastLanding(f.world.mission!)).toMatchObject({ base: null, advanced: null })
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).reasons).toContain('Landed at Dulag, not a friendly base')
  })

  it('a hostile carrier deck', () => {
    const enemy = { ...CV_1, id: 'zuikaku', side: 'axis' }
    const f0 = frameFor({ ships: [enemy], terrainM: 0 })
    const deck = deckOf(f0.world.ships[0]!)!
    const p = deckWorld(deck, 0, 0)
    const f = land(f0, p.x, deck.center.y, p.z)
    expect(f.landing.report!.at).toMatchObject({ kind: 'carrier', id: 'zuikaku' })
    expect(baseOf(f)).toBeNull()
  })

  it('water outside every anchorage', () => {
    const w = catalinaLanded(30000)
    expect(w).not.toBeNull()
    expect(lastLanding(w!.mission!)!.base).toBeNull()
    expect(checkGroundStop(w!)).toEqual({ ok: false, reason: 'This is not a friendly base.' })
  })

  it('touch-and-go and go-around: climbing away again forgets the touchdown and reports no landing', () => {
    let f = nextFrameState(put(frameFor({}), TAC.x, 100 + GEAR_M + 50, TAC.z, 45, 0, 1), FRAME, NO_KEYS)
    f = frames(put(f, TAC.x, 100 + GEAR_M + 0.4, TAC.z, 30, 1, 1), (g) => g.landing.touchdown !== null)
    expect(f.landing.touchdown).not.toBeNull()
    f = nextFrameState(put(f, TAC.x, 100 + GEAR_M + 30, TAC.z, 40, -3, 1), FRAME, NO_KEYS)
    expect(f.landing.touchdown).toBeNull()
    expect(f.landing.report).toBeNull()
    expect(lastLanding(f.world.mission!)).toBeUndefined()
  })

  it('still rolling is not a stop: a report needs the aircraft at rest', () => {
    let f = nextFrameState(put(frameFor({}), TAC.x, 100 + GEAR_M + 50, TAC.z, 45, 0, 1), FRAME, NO_KEYS)
    f = frames(put(f, TAC.x, 100 + GEAR_M + 0.4, TAC.z, 30, 1, 1), (g) => g.landing.touchdown !== null)
    f = nextFrameState(put(f, TAC.x, 100 + GEAR_M, TAC.z, 12, 0, 1), FRAME, NO_KEYS)
    expect(f.landing.report).toBeNull()
  })
})

/**
 * The player's Catalina, flown into the water-quals bay (`offsetM` metres east of the anchorage centre) and brought to
 * rest by the water model, or null if it never stops within three minutes.
 */
function catalinaLanded(offsetM: number): World<undefined> | null {
  const spec = loadAircraftSpec('pby-5a-catalina')
  let w = worldFromScenario(loadScenarioBundle('water-quals'), flatField(0))
  const bay = w.anchorages![0]!
  const start = createState({
    position: v3(bay.x + offsetM, spec.waterOperations!.hullDepthM + 14, bay.z),
    velocity: v3(40, -2.2, 0), attitude: qFromAxisAngle(v3(0, 0, 1), (5 * Math.PI) / 180),
    gearFraction: 0, flapFraction: 1, fuelKg: 1800, tick: w.tick,
  })
  w = withAircraftState(w, w.player, start)
  w = { ...w, aircraft: w.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)) }
  for (let i = 0; i < 180 / DT; i++) {
    w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: false, flapDown: true }), DT).world
    if (playerAircraft(w).impact !== null) return null
    if (lastLanding(w.mission!) !== undefined) return w
  }
  return null
}
