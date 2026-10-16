/**
 * F5C D7/D8 (2026-10-16): the ground stop between two legs. A real landing is flown to rest (the frame-level helper the
 * recovery-agreement test uses), then `groundStop` is applied and the new start state is read back: where it is, which
 * way it faces, what it carries, and what it must NOT have touched (the clock, the AI, the ships, the mission log).
 */
import { describe, expect, it } from 'vitest'
import { checkGroundStop, groundStop, LAUNCH_SPOT_FROM_STERN_M, runwayStart, THRESHOLD_MARGIN_M, WATER_CLEARANCE_M } from '../../src/sim/groundStop.js'
import { canonicalStringify } from '../../src/flightRecorder/canonical.js'
import { initialFrameStateFor, withGroundStop, type FrameState } from '../../src/render/frame.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { bundleForScenario, loadAircraftSpec, loadAirfield, loadScenarioBundle } from '../../tools/content/load.js'
import { playerAircraft, withAircraftState, type World } from '../../src/sim/loop.js'
import { stateOnDeck } from '../../src/sim/mission/respot.js'
import { deckAxes, deckOf, deckWorld } from '../../src/sim/world/deck.js'
import { localToWorld, runwayHeadingRad } from '../../src/sim/world/airfields.js'
import { length, sub } from '../../src/sim/math/vec3.js'
import { healthyDamage } from '../../src/sim/damage/model.js'
import { storesFromLoadout } from '../../src/sim/weapons/stores.js'
import type { AircraftState } from '../../src/sim/flight/state.js'
import { flatField } from './mission/fixture.js'
import { land } from './mission/stopFixture.js'

const TAC = loadAirfield('tacloban')
const HELLCAT = loadAircraftSpec('f6f-hellcat')
const CV_1 = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[-25629, -16479], [-25629, -26479]], speedMps: 7.7 }

function frameWith(over: { ships?: unknown[]; windFromDeg?: number; windMps?: number; airfields?: string[]; terrainM?: number }): FrameState {
  const raw = {
    id: 'stop', player: 'f6f-1', airfields: over.airfields ?? ['tacloban'],
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [TAC.runway.center.x, 500, TAC.runway.center.z], headingDeg: 0, speedMps: 60 } }],
    ships: over.ships ?? [], weather: { windFromDeg: over.windFromDeg ?? 0, windMps: over.windMps ?? 0 },
  }
  return initialFrameStateFor(worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(over.terrainM ?? 100)))
}

/** The nose's compass heading, 0 north: body +x rotated by the attitude. */
function headingDeg(s: AircraftState): number {
  const { x, y, z, w } = s.attitude
  const nx = 1 - 2 * (y * y + z * z), nz = 2 * (x * z - w * y)
  return ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360
}

const landedAtTacloban = (over: Parameters<typeof frameWith>[0] = {}): FrameState => land(frameWith(over), TAC.runway.center.x, 100, TAC.runway.center.z)

describe('a runway stop (D8)', () => {
  it('goes to the threshold of the end that faces the wind, at rest, flaps up, brakes held, refueled', () => {
    // Wind from the south (180): blowing north, so the takeoff faces south, the reciprocal of Tacloban's heading 0.
    const f = landedAtTacloban({ windFromDeg: 180, windMps: 6 })
    const before = playerAircraft(f.world)
    const out = groundStop(f.world, 'bombs')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const p = playerAircraft(out.world)
    expect(out.placement).toMatchObject({ kind: 'runway', description: expect.stringContaining('Tacloban, runway 18') })
    expect(headingDeg(p.state)).toBeCloseTo(180, 3)
    const north = localToWorld(TAC, 0, -(TAC.runway.lengthM / 2 - THRESHOLD_MARGIN_M))
    expect(Math.hypot(p.state.position.x - north.x, p.state.position.z - north.z)).toBeLessThan(1)
    expect(length(p.state.velocity)).toBe(0)
    expect(p.state.flapFraction).toBe(0)
    expect(p.state.gearFraction).toBe(1)
    expect(p.controls).toMatchObject({ brake: 1, gearDown: true, flapDown: false, throttle: 0 })
    expect(p.state.fuelKg).toBe(HELLCAT.mass.fuelCapacityKg)
    expect(p.state.engineRpm).toEqual(before.state.engineRpm) // the engine is still running
    expect(p.state.tick).toBe(f.world.tick)
    expect(p.impact).toBeNull()
  })

  it('calm air keeps the runway heading and starts at the other end; the reciprocal wind flips both', () => {
    const calm = runwayStart(landedAtTacloban().world, TAC)
    expect(calm.headingRad).toBeCloseTo(runwayHeadingRad(TAC), 9)
    const south = localToWorld(TAC, 0, TAC.runway.lengthM / 2 - THRESHOLD_MARGIN_M)
    expect([calm.x, calm.z]).toEqual([south.x, south.z])
    const wind = runwayStart(landedAtTacloban({ windFromDeg: 180, windMps: 5 }).world, TAC)
    expect(wind.headingRad).toBeCloseTo(runwayHeadingRad(TAC) + Math.PI, 9)
    expect(wind.end).toBe('18')
    expect(calm.end).toBe('36')
  })

  it('rearms to the chosen loadout, repairs, and refills the guns; nothing else in the world changes', () => {
    const f = landedAtTacloban()
    // Wound it first: lost its bombs, damaged, empty guns.
    const rec = f.world.combat.aircraft['f6f-1']!
    const worn = { ...f.world, combat: { ...f.world.combat, aircraft: { ...f.world.combat.aircraft, 'f6f-1': { ...rec, stores: { bombs: 0, rockets: 0 }, guns: rec.guns.map((g) => ({ ...g, ammo: 0 })) } } } }
    const out = groundStop(worn, 'both')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const after = out.world.combat.aircraft['f6f-1']!
    expect(after.stores).toEqual(storesFromLoadout(HELLCAT, 'both'))
    expect(after.stores.bombs).toBeGreaterThan(0)
    expect(after.damage).toEqual(healthyDamage())
    expect(after.guns.map((g) => g.ammo)).toEqual(HELLCAT.combat!.guns.map((g) => g.rounds))
    // D7: no mission-clock jump; the AI, ships, structures and mission are the very same objects.
    expect(out.world.tick).toBe(worn.tick)
    expect(out.world.ships).toBe(worn.ships)
    expect(out.world.structures).toBe(worn.structures)
    expect(out.world.mission).toBe(worn.mission)
    expect(out.world.wind).toBe(worn.wind)
    expect(out.world.accumulatorSeconds).toBe(worn.accumulatorSeconds)
  })

  it('is deterministic: the same stop twice gives the same bytes', () => {
    const f = landedAtTacloban({ windFromDeg: 90, windMps: 4 })
    const a = groundStop(f.world, 'bombs')
    const b = groundStop(f.world, 'bombs')
    expect(a.ok && b.ok).toBe(true)
    if (a.ok && b.ok) expect(canonicalStringify(a.world)).toBe(canonicalStringify(b.world))
  })

  it('refuses a loadout the aircraft does not carry, and a stop that is not a friendly base', () => {
    const f = landedAtTacloban()
    const torp = groundStop(f.world, 'torpedoes')
    expect(!torp.ok && torp.reason).toMatch(/does not carry/)
    const off = land(frameWith({}), 0, 100, 0) // off the strip: open ground
    const check = checkGroundStop(off.world)
    expect(check.ok).toBe(false)
    expect(groundStop(off.world, 'clean').ok).toBe(false)
  })

  it('the frame applies it: levers follow the start state, the pause and the landing are released, the camera follows', () => {
    const f = landedAtTacloban()
    expect(f.landing.report).not.toBeNull()
    const out = withGroundStop({ ...f, paused: true, flapDown: true, hookDown: true }, 'clean')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.frame.landing.report).toBeNull()
    expect(out.frame.paused).toBe(false)
    expect([out.frame.gearDown, out.frame.flapDown, out.frame.hookDown]).toEqual([true, false, false])
    const p = playerAircraft(out.frame.world).state.position
    expect(Math.hypot(out.frame.render.position.x - p.x, out.frame.render.position.z - p.z)).toBeLessThan(0.01)
    expect(Math.hypot(out.frame.eye.position.x - p.x, out.frame.eye.position.z - p.z)).toBeLessThan(200) // the chase eye followed
  })
})

describe('a carrier stop (D8)', () => {
  it('goes to the launch spot on the moving deck, bow first, moving with the ship, which keeps steaming', () => {
    const f0 = frameWith({ ships: [CV_1], terrainM: 0 }) // sea: the ship's loop must not cross land
    const deck0 = deckOf(f0.world.ships[0]!)!
    // Trapped and stopped relative to the deck, somewhere forward of the launch spot, while the ship steams at 15 kn.
    const resting = stateOnDeck(HELLCAT, deck0, { x: 4, z: 20 }, { tick: f0.world.tick })
    const f = { ...f0, world: withAircraftState(f0.world, f0.world.player, resting) }
    const out = groundStop(f.world, 'clean')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.placement.kind).toBe('carrier')
    const p = playerAircraft(out.world)
    const d = deckOf(out.world.ships[0]!)!
    const spot = deckWorld(d, 0, -d.lengthM / 2 + LAUNCH_SPOT_FROM_STERN_M)
    expect(Math.hypot(p.state.position.x - spot.x, p.state.position.z - spot.z)).toBeLessThan(0.01)
    const bow = deckAxes(d).bow
    expect(Math.hypot(Math.sin((headingDeg(p.state) * Math.PI) / 180) - bow.x, -Math.cos((headingDeg(p.state) * Math.PI) / 180) - bow.z)).toBeLessThan(1e-6)
    // At rest relative to the deck: the deck's own speed, so the launch starts from deck speed plus wind.
    expect(length(sub(p.state.velocity, d.velocity))).toBeLessThan(0.1)
    expect(length(p.state.velocity)).toBeGreaterThan(7)
    expect(out.world.ships).toBe(f.world.ships) // the carrier keeps steaming: untouched
    expect(p.state.arrested).toBe(false)
    expect(p.controls.hookDown).toBe(false)
  })
})

describe('a water stop (D8)', () => {
  const afloat = (): World<undefined> => worldFromScenario(loadScenarioBundle('water-quals'), flatField(0))

  it('stays where it stopped, nose into the wind, floats down, inside the declared anchorage', () => {
    const w = afloat()
    const check = checkGroundStop(w)
    expect(check).toMatchObject({ ok: true, placement: { kind: 'water', base: { kind: 'anchorage', id: 'san-pedro-bay' } } })
    const out = groundStop(w, 'clean')
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const p = playerAircraft(out.world)
    const before = playerAircraft(w)
    expect(p.state.position.x).toBe(before.state.position.x)
    expect(p.state.position.z).toBe(before.state.position.z)
    // water-quals: wind from 120 deg, so the Catalina faces 120.
    expect(headingDeg(p.state)).toBeCloseTo(120, 3)
    expect(p.state.flapFraction).toBe(1)
    expect(p.state.gearFraction).toBe(0)
    expect(p.state.fuelKg).toBe(loadAircraftSpec('pby-5a-catalina').mass.fuelCapacityKg)
  })

  it('an unsafe spot says why: a ship within the clearance blocks the relaunch', () => {
    const w = afloat()
    const p = playerAircraft(w).state.position
    const ship = { id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[p.x + WATER_CLEARANCE_M - 50, p.z]], speedMps: 0 }
    const raw = { ...loadScenarioBundle('water-quals').scenario, ships: [ship] }
    const near = worldFromScenario(bundleForScenario(parseScenario(JSON.parse(JSON.stringify(raw)))), flatField(0))
    const check = checkGroundStop(near)
    expect(check.ok).toBe(false)
    expect(!check.ok && check.reason).toMatch(/Too close to .* to take off from here/)
  })

  it('open water away from every anchorage and ship is not a base at all', () => {
    const w = afloat()
    const moved = { ...w, anchorages: [] }
    expect(checkGroundStop(moved)).toEqual({ ok: false, reason: 'This is not a friendly base.' })
  })
})
