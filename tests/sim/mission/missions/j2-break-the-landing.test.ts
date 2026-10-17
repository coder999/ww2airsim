/**
 * J2 Break the Landing (F10C, 2026-10-17): authored before the scenario.
 * Draft only; the reviewer runs these tests. Injected combat records prove the
 * objective graph, not torpedo accuracy or the unmeasured CAP encounter time.
 * The OR is `hit` (primary, atLeast 1 of maru, escort); the two branches are SECONDARY, because missionOutcome
 * requires every primary and would otherwise demand both (Claude's ruling on Codex's question, 2026-10-17).
 */
import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenario, loadScenarioBundle, loadShipSpec } from '../../../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft, withAircraftState, type World } from '../../../../src/sim/loop.js'
import { sideOf } from '../../../../src/sim/sides.js'
import { v3 } from '../../../../src/sim/math/vec3.js'
import { attitudeAngles } from '../../../../src/sim/flight/attitude.js'
import { ticksFor, radioMessages } from '../../../../src/sim/mission/state.js'
import { missionOutcome, recoveryOf } from '../../../../src/sim/mission/outcome.js'
import { assertLoopOverWater } from '../../../../src/sim/world/ships.js'
import { heightAt, SEA_LEVEL_M } from '../../../../src/sim/world/terrain.js'
import { FLOOD_DAMAGE_FRACTION } from '../../../../src/sim/weapons/flooding.js'
import { progressOf, putPlayer, steps } from '../fixture.js'
import { destroyNow, DITCH, fieldApproach, hold, levelAt, stageDitch, stepsWithControls, terrainOrSkip } from '../fly.js'

const ID = 'j2-break-the-landing'
const BADGE = { id: ID, name: 'Break the Landing' }
const CAP = { x: -22500, z: -31500 }
const GATE = { x: -46500, z: -41000 }
const CAP_IDS = ['cap-1', 'cap-2', 'cap-3']
const MARUS = ['maru-1', 'maru-2', 'maru-3', 'maru-4']
const LCVPS = ['lcvp-1', 'lcvp-2', 'lcvp-3', 'lcvp-4']
const FAR = levelAt({ x: 60000, z: 60000 }, 3000, 75, 90)
const WEST = 'Observer: Good hit. Head west for the gate.'
const CLEAR = 'Observer: Clear of the shipping. Strike complete.'
const terrain = terrainOrSkip()
const strike = (field: typeof terrain = null): World<undefined> => worldFromScenario(loadScenarioBundle(ID), field, 'torpedoes')
const atCap = (w: World<undefined>): World<undefined> => steps(putPlayer(w, v3(CAP.x, 1500, CAP.z), 75, 0), 2)
const atGate = (w: World<undefined>): World<undefined> => steps(putPlayer(w, v3(GATE.x, 3000, GATE.z), 75, 0), 2)

function sinkMaru(w: World<undefined>, by = w.player): World<undefined> {
  const hit = hold(destroyNow(w, ['maru-1'], by), FAR, 2)
  expect(hit.combat.ships['maru-1']).toMatchObject({ hp: 0, attacker: by })
  expect(hit.combat.ships['maru-1']!.destroyedTick).not.toBeNull()
  return hit
}

/** Explicit HP stimulus; no damage or destruction on the other ships. */
function damageShip(w: World<undefined>, id: string, fraction: number): World<undefined> {
  const ship = w.ships.find((s) => s.id === id)!
  expect(ship).toBeDefined()
  const rec = w.combat.ships[id]!
  expect(rec.destroyedTick).toBeNull()
  const hp = ship.spec.hullHp * fraction
  const changed = { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, [id]: { ...rec, hp, attacker: w.player } } } }
  const result = hold(changed, FAR, 2)
  expect(result.combat.ships[id]!.hp).toBe(hp)
  expect(result.combat.ships[id]!.destroyedTick).toBeNull()
  return result
}

describe('J2 Break the Landing content', () => {
  it('starts the Japanese Kate player and two Kate wingmen against three green Hellcats, with no friendly fighter', () => {
    const s = loadScenario(ID)
    const w = strike()
    expect(s.player).toBe('kate-1')
    expect(s.aircraft.find((a) => a.id === s.player)).toMatchObject({
      spec: 'b5n2-kate', side: 'axis', airborneAt: { position: [-17291, 1500, -17955], headingDeg: 338, speedMps: 75 },
    })
    expect(sideOf(w, playerAircraft(w))).toBe('axis')
    expect(s.aircraft).toHaveLength(6)
    expect(s.aircraft.every((a) => 'airborneAt' in a)).toBe(true)
    const friendly = s.aircraft.filter((a) => a.side === 'axis')
    expect(friendly.map((a) => a.spec)).toEqual(['b5n2-kate', 'b5n2-kate', 'b5n2-kate'])
    for (const slot of [1, 2]) expect(friendly[slot]).toMatchObject({ id: `kate-${slot + 1}`, pilot: { leader: 'kate-1', slot } })
    const cap = s.aircraft.filter((a) => a.side === 'allied')
    expect(cap.map((a) => a.id)).toEqual(CAP_IDS)
    for (const a of cap) expect(a).toMatchObject({ spec: 'f6f-hellcat', tags: ['cap'], pilot: { skill: 'green' } })
    expect(s.heldGroups ?? []).toHaveLength(0)
    expect(s.sites).toBeUndefined()
    expect(s.airfields).toEqual(['dulag'])
    expect(s.airfieldSides).toEqual({ dulag: 'axis' })
    expect(s.weather).toMatchObject({ timeOfDay: 15.25, clouds: [{ kind: 'cumulus', coverage: 0.6, baseM: 1000, thicknessM: 800 }] })
  })

  it('builds eight Allied ships and four floating landing craft with unambiguous target references', () => {
    const s = loadScenario(ID)
    const w = strike()
    expect(w.ships).toHaveLength(8)
    for (const [spec, count] of [['type-b-maru', 4], ['fletcher-dd', 2], ['cleveland-cl', 1], ['pennsylvania-bb', 1]] as const) {
      expect(w.ships.filter((ship) => ship.spec.id === spec)).toHaveLength(count)
    }
    for (const ship of w.ships) expect(sideOf(w, ship)).toBe('allied')
    expect(w.vehicles.map((v) => v.id)).toEqual(LCVPS)
    for (const vehicle of w.vehicles) {
      expect(vehicle).toMatchObject({ spec: { id: 'lcvp', floats: true }, side: 'allied', orders: { speedMps: 4, loop: true } })
      expect(vehicle.orders.waypoints).toHaveLength(2)
    }
    const entities = [...s.aircraft, ...s.ships, ...s.vehicles]
    const ids = new Set(entities.map((e) => e.id))
    for (const e of entities) for (const tag of e.tags ?? []) expect(ids.has(tag), `${e.id}: ambiguous tag ${tag}`).toBe(false)
    expect(w.mission!.objectives.find((o) => o.id === 'maru')).toMatchObject({ kind: 'destroy', resolved: MARUS, priority: 'secondary' })
    expect(w.mission!.objectives.find((o) => o.id === 'lcvps')).toMatchObject({ kind: 'destroy', resolved: LCVPS, count: 2 })
    expect(w.mission!.objectives.find((o) => o.id === 'hit')).toMatchObject({ kind: 'atLeast', n: 1, of: ['maru', 'escort'], priority: 'primary' })
    expect(w.mission!.objectives.find((o) => o.id === 'escort')).toMatchObject({
      kind: 'damage', resolved: ['fletcher-1', 'fletcher-2', 'cleveland'], belowHpFraction: 0.5, count: 1, after: 'cap',
    })
  })

  it('accepts the declared population and rejects one extra aircraft or ship', () => {
    const s = loadScenario(ID)
    expect(s.population).toEqual({ airborne: 6, ships: 8 })
    expect(() => parseScenario(s)).not.toThrow()
    const extraAircraft = { id: 'extra-cap', spec: 'f6f-hellcat', side: 'allied', airborneAt: { position: [-21000, 2000, -28000], headingDeg: 90, speedMps: 100 } }
    expect(() => parseScenario({ ...s, aircraft: [...s.aircraft, extraAircraft] })).toThrow(/7 aircraft can be airborne at once/)
    const extraShip = { ...s.ships[0]!, id: 'extra-maru' }
    expect(() => parseScenario({ ...s, ships: [...s.ships, extraShip] })).toThrow(/9 ships can be present at once/)
  })

  it('uses egress recovery and the requested loadout, which actually equips a Type 91 torpedo', () => {
    const s = loadScenario(ID)
    const w = strike()
    expect(s.recovery).toEqual({ kind: 'egress', objective: 'gate' })
    expect(s.freezeOnSuccess ?? false).toBe(false)
    expect(s.badge).toEqual(BADGE)
    expect(s.briefing?.loadout).toBe('torpedoes')
    expect(w.combat.aircraft[w.player]!.stores).toEqual({ bombs: 1, rockets: 0 })
    const spec = playerAircraft(w).spec
    expect(spec.stores!.types[spec.stores!.racks[0]!.store]!.kind).toBe('torpedo')
    expect(spec.combat!.guns).toHaveLength(0)
    expect(s.history?.text).toContain('historical composite')
    expect(s.history?.text).toContain('inspired by')
    expect(s.history?.sources).toHaveLength(2)
  })
})

describe('J2 weapon margin (C4, measured against the real specs, 2026-10-17)', () => {
  // The Kate carries ONE Type 91 (b5n2-kate.json stores). A hit does its damage at once and then floods for 0.6 x that more (flooding.ts).
  const torpedo = loadAircraftSpec('b5n2-kate').stores!.types['type91']!
  const flooded = torpedo.damage * (1 + FLOOD_DAMAGE_FRACTION)
  const hull = (id: string): number => loadShipSpec(id).hullHp
  it('one torpedo hit takes a Fletcher below half hull at once: the escort branch is reachable with the weapon the player has', () => {
    expect((hull('fletcher-dd') - torpedo.damage) / hull('fletcher-dd')).toBeLessThan(0.5)
  })
  it('one torpedo hit does NOT sink a Maru, even after the flood, and does NOT take a Cleveland below half: F3\'s "destroy one Maru" needs a second hit, and the Cleveland needs two', () => {
    expect(hull('type-b-maru') - flooded).toBeGreaterThan(0)
    expect((hull('cleveland-cl') - flooded) / hull('cleveland-cl')).toBeGreaterThan(0.5)
    expect(hull('type-b-maru') - 2 * flooded).toBeLessThan(0) // two hits do
    expect((hull('cleveland-cl') - 2 * flooded) / hull('cleveland-cl')).toBeLessThan(0.5)
  })
})

describe('J2 objective graph and egress', () => {
  it('a passive distant player completes nothing', () => {
    const w = hold(strike(), FAR, ticksFor(30))
    expect(w.tick).toBe(ticksFor(30))
    expect(playerAircraft(w).impact).toBeNull()
    expect(w.mission!.objectives.map((o) => o.id)).toEqual(['cap', 'maru', 'escort', 'hit', 'gate', 'lcvps'])
    expect(w.mission!.progress.filter((p) => p.status === 'complete')).toHaveLength(0)
    expect(recoveryOf(w)).toBeNull()
    expect(radioMessages(w.mission!).length).toBeGreaterThan(0)
  })

  it('one Maru completes the OR branch, then the player crossing the gate earns the badge', () => {
    let w = atCap(strike())
    expect(progressOf(w, 'cap').status).toBe('complete')
    w = sinkMaru(w)
    expect(progressOf(w, 'maru').status).toBe('complete')
    expect(progressOf(w, 'escort').status).not.toBe('complete')
    expect(progressOf(w, 'hit').status).toBe('complete')
    expect(progressOf(w, 'gate').status).not.toBe('complete')
    expect(recoveryOf(w)).toBeNull()
    expect(radioMessages(w.mission!).map((m) => m.text)).toContain(WEST)
    w = atGate(w)
    expect(progressOf(w, 'gate').status).toBe('complete')
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: BADGE, reasons: [] })
    expect(radioMessages(w.mission!).map((m) => m.text)).toContain(CLEAR)
    expect(w.mission!.latched).not.toBe(true)
  })

  it.each(['fletcher-1', 'cleveland'])('%s below half hull completes the other OR branch without a Maru sinking', (id) => {
    let w = damageShip(atCap(strike()), id, 0.49)
    expect(progressOf(w, 'escort').status).toBe('complete')
    expect(progressOf(w, 'maru').status).not.toBe('complete')
    expect(progressOf(w, 'hit').status).toBe('complete')
    for (const maru of MARUS) expect(w.combat.ships[maru]!.destroyedTick).toBeNull()
    w = atGate(w)
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'success', badge: BADGE })
  })

  it.each([0.6, 0.5])('a Fletcher at %s hull does not qualify, even when the player crosses the gate', (fraction) => {
    const w = atGate(damageShip(atCap(strike()), 'fletcher-1', fraction))
    expect(progressOf(w, 'escort').status).not.toBe('complete')
    expect(progressOf(w, 'hit').status).not.toBe('complete')
    expect(progressOf(w, 'gate').status).not.toBe('complete')
    expect(Math.hypot(playerAircraft(w).state.position.x - GATE.x, playerAircraft(w).state.position.z - GATE.z)).toBeLessThan(3000)
    expect(recoveryOf(w)).toBeNull()
  })

  it('a Pennsylvania hit is not an escort alternative', () => {
    const w = damageShip(atCap(strike()), 'pennsylvania', 0.1)
    expect(progressOf(w, 'escort').status).not.toBe('complete')
    expect(progressOf(w, 'hit').status).not.toBe('complete')
  })

  it('crossing before the hit is not remembered: return after the strike to complete the gate', () => {
    let w = atGate(atCap(strike()))
    expect(progressOf(w, 'cap').status).toBe('complete')
    expect(progressOf(w, 'gate').status).not.toBe('complete')
    expect(recoveryOf(w)).toBeNull()
    w = sinkMaru(w)
    expect(progressOf(w, 'hit').status).toBe('complete')
    expect(progressOf(w, 'gate').status).not.toBe('complete')
    expect(recoveryOf(w)).toBeNull()
    w = atGate(w)
    expect(progressOf(w, 'gate').status).toBe('complete')
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
  })

  it('only the player reaches either station; an AI crossing cannot advance it', () => {
    let w = strike()
    for (const [station, point] of [['cap', CAP], ['gate', GATE]] as const) {
      if (station === 'gate') w = sinkMaru(atCap(w))
      const aiState = levelAt(point, 1500, 75)
      w = hold(withAircraftState(w, 'kate-2', { ...aiState, tick: w.tick }), FAR, 2)
      const ai = w.aircraft.find((a) => a.id === 'kate-2')!
      expect(Math.hypot(ai.state.position.x - point.x, ai.state.position.z - point.z)).toBeLessThan(2500)
      expect(progressOf(w, station).status).not.toBe('complete')
      expect(recoveryOf(w)).toBeNull()
    }
  })

  it('ship destruction is not player-attributed: a wingman kill also completes the strike', () => {
    const w = sinkMaru(atCap(strike()), 'kate-2')
    expect(progressOf(w, 'maru').status).toBe('complete')
    expect(progressOf(w, 'hit').status).toBe('complete')
    expect(progressOf(w, 'gate').status).not.toBe('complete')
  })

  it('the landing-craft secondary needs two losses and cannot substitute for a shipping hit', () => {
    let w = hold(destroyNow(atCap(strike()), ['lcvp-1']), FAR, 2)
    expect(w.combat.vehicles['lcvp-1']!.destroyedTick).not.toBeNull()
    expect(progressOf(w, 'lcvps')).toMatchObject({ count: 1, status: 'active' })
    w = hold(destroyNow(w, ['lcvp-2']), FAR, 2)
    expect(w.combat.vehicles['lcvp-2']!.destroyedTick).not.toBeNull()
    expect(progressOf(w, 'lcvps')).toMatchObject({ count: 2, status: 'complete' })
    expect(progressOf(w, 'hit').status).not.toBe('complete')
    expect(recoveryOf(atGate(w))).toBeNull()
  })

  it('death after crossing the gate overrides egress and removes the badge', () => {
    let w = atGate(sinkMaru(atCap(strike())))
    expect(recoveryOf(w)).toEqual({ kind: 'egressed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!).badge).toEqual(BADGE)
    w = steps(destroyNow(w, [w.player], 'cap-1'), 2)
    expect(w.combat.aircraft[w.player]!.damage.destroyedAt).not.toBeNull()
    expect(progressOf(w, 'gate').status).toBe('complete')
    expect(recoveryOf(w)).toEqual({ kind: 'killed' })
    expect(missionOutcome(w.mission!, recoveryOf(w)!)).toMatchObject({ result: 'no-badge', badge: null, reasons: ['Killed'] })
  })
})

describe.skipIf(terrain === null)('J2 on real terrain', () => {
  it('all ship and LCVP loops stay over water, and all four LCVPs move during thirty seconds', () => {
    const start = strike(terrain)
    expect(start.ships).toHaveLength(8)
    expect(start.vehicles.map((v) => v.id)).toEqual(LCVPS)
    for (const entity of [...start.ships, ...start.vehicles]) {
      expect(() => assertLoopOverWater(entity.id, entity.orders, terrain!)).not.toThrow()
    }
    const w = hold(start, FAR, ticksFor(30))
    expect(w.tick - start.tick).toBe(ticksFor(30))
    for (const before of start.vehicles) {
      const after = w.vehicles.find((v) => v.id === before.id)!
      expect(w.combat.vehicles[before.id]!.destroyedTick).toBeNull()
      expect(Math.hypot(after.state.position.x - before.state.position.x, after.state.position.z - before.state.position.z)).toBeCloseTo(120, 3)
      expect(after.state.stopped).toBe(false)
    }
  })

  it('landing the Kate at friendly Dulag after the hit is explicitly no badge', () => {
    let w = sinkMaru(atCap(strike(terrain)))
    // Isolate the recovery contract from CAP gunfire during the long approach.
    w = steps(destroyNow(w, CAP_IDS), 2)
    for (const id of CAP_IDS) expect(w.combat.aircraft[id]!.damage.destroyedAt).not.toBeNull()
    expect(progressOf(w, 'hit').status).toBe('complete')
    w = fieldApproach(w, 'dulag')
    expect(playerAircraft(w).impact).toBeNull()
    expect(recoveryOf(w)).toMatchObject({ kind: 'landed', at: { id: 'dulag' }, base: { id: 'dulag', kind: 'airfield' } })
    expect(progressOf(w, 'gate').status).not.toBe('complete')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null })
    expect(out.reasons).toContain('Landed: this mission ends at its egress gate')
  })

  it('ditching after the hit is no badge', () => {
    const at = { x: -17000, z: -18000 }
    expect(heightAt(terrain!, at.x, at.z)).toBeLessThanOrEqual(SEA_LEVEL_M)
    let w = stageDitch(sinkMaru(atCap(strike(terrain))), at)
    // DITCH's 45 m/s is a Hellcat fixture, above the Kate's 1.2 x clean-stall
    // contact limit. Keep its attitude, but stage this slower Kate lower too.
    const p = playerAircraft(w)
    const speed = Math.min(DITCH.speedMps, p.spec.reference.stallSpeedMps * 1.1)
    w = withAircraftState(w, w.player, { ...p.state, position: v3(at.x, SEA_LEVEL_M + 0.4, at.z), velocity: v3(0, 0, -speed) })
    expect(attitudeAngles(playerAircraft(w).state).pitchRad * 180 / Math.PI).toBeCloseTo(DITCH.pitchDeg, 6)
    for (let i = 0; i < 600 && playerAircraft(w).impact === null; i++) w = stepsWithControls(w, 1, { throttle: 0 })
    expect(playerAircraft(w).impact).toMatchObject({ kind: 'ditched', surface: 'water' })
    expect(recoveryOf(w)).toEqual({ kind: 'ditched' })
    expect(progressOf(w, 'hit').status).toBe('complete')
    const out = missionOutcome(w.mission!, recoveryOf(w)!)
    expect(out).toMatchObject({ result: 'no-badge', badge: null })
    expect(out.reasons).toContain('Ditched')
  })
})
