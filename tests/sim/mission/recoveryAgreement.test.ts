import { describe, it, expect } from 'vitest'
import { initialFrameStateFor, nextFrameState, type FrameState } from '../../../src/render/frame.js'
import { debriefModel, destructionModel, landingModel } from '../../../src/render/debrief.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario, loadAircraftSpec, loadAirfield } from '../../../tools/content/load.js'
import { playerAircraft, withAircraftState } from '../../../src/sim/loop.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import type { TerrainField } from '../../../src/sim/world/terrain.js'
import { zeroKillsByType } from '../../../src/sim/weapons/targetType.js'
import type { LandingAt } from '../../../src/sim/landing.js'
import { missionOutcome, recoveryOf } from '../../../src/sim/mission/outcome.js'
import { NORTH, flatField } from './fixture.js'

/**
 * Spec 2026-09-25 §1: "A Tier 1 test pins that the render banking path and
 * the mission outcome agree on every recovery kind." The render path is
 * what main.ts banks from: `frame.landing.report` into `landingModel`, or
 * the player's `impact` into `debriefModel`, or combat destruction into
 * `destructionModel`. Each builder's `outcome` must equal the kind
 * `recoveryOf` reads off the same world, and for a landing, `at` must be
 * the same place.
 */
const GEAR_M = loadAircraftSpec('f6f-hellcat').gear.heightM
const TAC = loadAirfield('tacloban').runway.center
const CV_1 = { id: 'cv-1', spec: 'essex-cv', waypoints: [[-25629, -16479]], speedMps: 0 }
const FRAME = 1 / 60
const NO_KEYS: ReadonlySet<string> = new Set()
const kills = zeroKillsByType()

function frameFor(ships: unknown[], landAt: string, terrain: TerrainField | null): FrameState {
  const raw = {
    id: 'agreement', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.x, 500, TAC.z], headingDeg: 0, speedMps: 60 } }],
    ships, weather: { windFromDeg: 0, windMps: 0 },
    objectives: [{ id: 'home', label: 'Recover', priority: 'primary', kind: 'land', at: landAt }],
  }
  return initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(raw)), terrain))
}

/** The player's body origin at (x, originY, z), north at `speed`, sinking at `sink`. */
function put(f: FrameState, x: number, originY: number, z: number, speed: number, sink: number, gear: number): FrameState {
  return { ...f, world: withAircraftState(f.world, f.world.player, createState({
    position: v3(x, originY, z), velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: gear, flapFraction: 1, tick: f.world.tick,
  })) }
}

const frames = (f: FrameState, stop: (f: FrameState) => boolean): FrameState => {
  let g = f
  for (let i = 0; i < 120 && !stop(g); i++) g = nextFrameState(g, FRAME, NO_KEYS)
  return g
}

/** Latch airborne, settle from 0.4 m (wheels), come to rest: as measured 2026-09-25. */
function land(f: FrameState, x: number, groundY: number, z: number): FrameState {
  let g = nextFrameState(put(f, x, groundY + GEAR_M + 50, z, 45, 0, 1), FRAME, NO_KEYS)
  g = frames(put(g, x, groundY + GEAR_M + 0.4, z, 30, 1, 1), (h) => h.landing.touchdown !== null)
  expect(g.landing.touchdown, 'no touchdown').not.toBeNull()
  g = nextFrameState(put(g, x, groundY + GEAR_M, z, 0, 0, 1), FRAME, NO_KEYS)
  expect(g.landing.report, 'no landing report').not.toBeNull()
  return g
}

function expectLandedAgreement(f: FrameState, at: LandingAt | null): void {
  const report = f.landing.report!
  expect(report.at).toEqual(at)
  const recovery = recoveryOf(f.world)
  expect(recovery).toEqual({ kind: 'landed', at })
  expect(landingModel(report, kills).outcome).toBe(recovery!.kind)
}

describe('the render banking path and the mission outcome agree (spec §1, §5)', () => {
  it('landed at an airfield: same base, and the badge rule sees the landing', () => {
    const f = land(frameFor([], 'tacloban', flatField(100)), TAC.x, 100, TAC.z)
    expectLandedAgreement(f, { kind: 'airfield', id: 'tacloban', name: 'Tacloban' })
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).result).toBe('success')
  })

  it('landed on a carrier', () => {
    const f0 = frameFor([CV_1], 'cv-1', null)
    const deck = deckOf(f0.world.ships[0]!)!
    const p = deckWorld(deck, 0, 0)
    const f = land(f0, p.x, deck.center.y, p.z)
    expectLandedAgreement(f, { kind: 'carrier', id: 'cv-1', name: 'cv-1' })
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).result).toBe('success')
  })

  it('landed off-field', () => {
    const f = land(frameFor([], 'tacloban', flatField(100)), 0, 100, 0)
    expectLandedAgreement(f, null)
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).reasons).toEqual(['Landed off-field', 'Recover: incomplete'])
  })

  it('ditched', () => {
    let f = nextFrameState(put(frameFor([], 'tacloban', flatField(0)), 0, 50, 0, 45, 0, 1), FRAME, NO_KEYS)
    f = frames(put(f, 0, 0.4, 0, 45, 1, 0), (g) => playerAircraft(g.world).impact !== null)
    const impact = playerAircraft(f.world).impact!
    expect(impact.kind).toBe('ditched')
    expect(debriefModel(impact, playerAircraft(f.world).state, kills).outcome).toBe('ditched')
    expect(recoveryOf(f.world)).toEqual({ kind: 'ditched' })
    expect(missionOutcome(f.world.mission!, recoveryOf(f.world)!).badge).toBeNull()
  })

  it('killed by impact', () => {
    let f = nextFrameState(put(frameFor([], 'tacloban', flatField(100)), 0, 100 + GEAR_M + 50, 0, 45, 0, 1), FRAME, NO_KEYS)
    f = frames(put(f, 0, 100 + GEAR_M + 0.4, 0, 60, 20, 0), (g) => playerAircraft(g.world).impact !== null)
    const impact = playerAircraft(f.world).impact!
    expect(impact.kind).toBe('destroyed')
    expect(debriefModel(impact, playerAircraft(f.world).state, kills).outcome).toBe('killed')
    expect(recoveryOf(f.world)).toEqual({ kind: 'killed' })
  })

  it('destroyed in the air', () => {
    const f = frameFor([], 'tacloban', null)
    const rec = f.world.combat.aircraft['f6f-1']!
    const world = { ...f.world, combat: { ...f.world.combat, aircraft: { ...f.world.combat.aircraft, 'f6f-1': { ...rec, damage: { ...rec.damage, destroyedAt: 5, attacker: 'bandit' } } } } }
    expect(destructionModel(playerAircraft(world).state, 'bandit', kills).outcome).toBe('killed')
    expect(recoveryOf(world)).toEqual({ kind: 'killed' })
    expect(missionOutcome(world.mission!, recoveryOf(world)!).reasons).toEqual(['Killed', 'Recover: incomplete'])
  })
})
