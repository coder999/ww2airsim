import { describe, expect, it } from 'vitest'
import { advance, aircraftById, withAircraftState, type World } from '../../../src/sim/loop.js'
import { IP_DISTANCE_M, IP_HEIGHT_M, recoveryControls, THREAT_ASTERN_RANGE_M } from '../../../src/sim/ai/recovery.js'
import { VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'
import type { AircraftState } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { MAX_SUPPORTED_SINK_MPS } from '../../../src/sim/ground.js'
import { length, scale, sub, v3 } from '../../../src/sim/math/vec3.js'
import { RESPOT_DELAY_S } from '../../../src/sim/mission/respot.js'
import { paddlesCue, type PaddlesCue } from '../../../src/sim/paddles.js'
import { insideRunway, worldToLocal } from '../../../src/sim/world/airfields.js'
import { deckLocal, decksOf } from '../../../src/sim/world/deck.js'
import { heightAt, type TerrainField } from '../../../src/sim/world/terrain.js'
import { airborne } from '../../../src/sim/ai/airborne.js'
import { loadAirfield } from '../../../tools/content/load.js'
import { terrainOrSkip } from '../mission/fly.js'
import { axis, buildRecovery, crashed, fly, homed, inRecovery, onApproach } from './recoveryWorlds.js'

type W = World<undefined>

const terrain = terrainOrSkip()

/** Seconds a landed, respotted AI is watched on its spot. */
const WATCH_AFTER_RESPOT_S = 32
/** Park-spot tolerance, deck-local or runway-world, every tick after the respot. */
const ON_SPOT_M = 0.5

/** axis-1 starts 40+ km off, outside detection range: it only matters once it is moved. */
const FAR_AXIS = axis('axis-1', [30000, 1500, 40000], 0)

/**
 * `id`, homed to `home`, at its IP: IP_DISTANCE_M short of the aim on the
 * centerline, IP_HEIGHT_M above touchdown, heading down it at 110 m/s, in
 * `rtb` at `join` (Task 6's `atIpJoining`, for either kind of home).
 */
function atIp(id: string, home: { ship: string } | { airfield: string }, field: TerrainField | null = null): W {
  const extra = 'airfield' in home ? { ships: [] } : {}
  const w = buildRecovery([homed(id, home, [0, 1000, 20000]), FAR_AXIS], extra, field)
  return inRecovery(onApproach(w, id, { alongM: IP_DISTANCE_M, wheelM: IP_HEIGHT_M, airspeedMps: 110 }), id, 'join')
}

const nowS = (w: W): number => w.tick * DT

type CarrierRun = {
  readonly cues: readonly PaddlesCue[]
  readonly arrestedFromSternM: number | null
  readonly restAtS: number | null
  readonly respotTick: number | null
  /** Worst deck-local distance from the park spot, every tick after the respot. */
  readonly worstOffSpotM: number
  readonly hookDownAfterRespot: boolean
  readonly crashed: boolean
  readonly world: W
}

let carrierRunCache: CarrierRun | null = null
/** ai-1 flown from cv-1's IP to WATCH_AFTER_RESPOT_S past its respot. Flown once, shared. */
function carrierRun(): CarrierRun {
  if (carrierRunCache !== null) return carrierRunCache
  const cues: PaddlesCue[] = []
  let arrestedFromSternM: number | null = null
  let restAtS: number | null = null
  let respotTick: number | null = null
  let worstOffSpotM = 0
  let hookDownAfterRespot = false
  let didCrash = false
  const world = fly(atIp('ai-1', { ship: 'cv-1' }), 900, (w) => {
    const a = aircraftById(w, 'ai-1')!
    didCrash ||= crashed(w, 'ai-1')
    const deck = decksOf(w.ships)[0]!
    const cue = paddlesCue(a.spec, a.state, a.controls, deck, w.ships[0]!.spec.paddles!, w.wind)
    if (cue !== null) cues.push(cue)
    if (arrestedFromSternM === null && a.state.arrested) {
      arrestedFromSternM = deckLocal(deck, a.state.position.x, a.state.position.z).z + deck.lengthM / 2
    }
    const r = a.pilot!.decision.recovery!
    restAtS ??= r.restAtS
    if (respotTick === null && r.respotted) respotTick = w.tick
    if (respotTick !== null) {
      const home = a.pilot!.home!
      if (home.kind !== 'ship') throw new Error('expected a ship home')
      const l = deckLocal(deck, a.state.position.x, a.state.position.z)
      worstOffSpotM = Math.max(worstOffSpotM, Math.hypot(l.x - home.parkSpot.x, l.z - home.parkSpot.z))
      hookDownAfterRespot ||= a.controls.hookDown === true
      return w.tick - respotTick >= WATCH_AFTER_RESPOT_S / DT
    }
  })
  carrierRunCache = { cues, arrestedFromSternM, restAtS, respotTick, worstOffSpotM, hookDownAfterRespot, crashed: didCrash, world }
  return carrierRunCache
}

describe('landing and the respot (7g spec §3, 7c-7g §6 acceptance)', () => {
  it('carrier: from the IP to an arrest inside the trap zone, at rest relative to the deck, with a roger (7c-7g §6 acceptance)', () => {
    const run = carrierRun()
    const deck = decksOf(run.world.ships)[0]!
    expect(run.crashed).toBe(false)
    expect(run.cues).toContain('roger')
    expect(run.arrestedFromSternM).not.toBeNull()
    expect(run.arrestedFromSternM!).toBeGreaterThan(deck.trapFromSternM)
    expect(run.arrestedFromSternM!).toBeLessThan(deck.trapToSternM)
    expect(run.restAtS).not.toBeNull()
    const a = aircraftById(run.world, 'ai-1')!
    expect(a.impact).toBeNull()
    expect(a.pilot!.decision.mode).toBe('landed')
  })

  it('carrier: respotted to its park spot RESPOT_DELAY_S after rest, clear of the trap zone, hook up, and stays there relative to the deck', () => {
    const run = carrierRun()
    expect(run.respotTick).not.toBeNull()
    // The respot tick is the first whose `nowS - restAtS >= RESPOT_DELAY_S`.
    expect(run.respotTick! * DT - run.restAtS!).toBeGreaterThanOrEqual(RESPOT_DELAY_S)
    expect(run.respotTick! * DT - run.restAtS!).toBeLessThan(RESPOT_DELAY_S + 2 * DT)
    expect(nowS(run.world) - run.respotTick! * DT).toBeGreaterThan(30)
    expect(run.worstOffSpotM).toBeLessThan(ON_SPOT_M)
    expect(run.hookDownAfterRespot).toBe(false)
    const a = aircraftById(run.world, 'ai-1')!
    const home = a.pilot!.home!
    if (home.kind !== 'ship') throw new Error('expected a ship home')
    const deck = decksOf(run.world.ships)[0]!
    expect(home.parkSpot.z + deck.lengthM / 2).toBeGreaterThan(deck.trapToSternM)
    expect(a.state.arrested).toBe(false)
    expect(a.pilot!.decision.mode).toBe('landed')
    expect(a.impact).toBeNull()
  })

  it.skipIf(terrain === null)('runway: touchdown inside the runway rectangle, sink under MAX_SUPPORTED_SINK_MPS, at rest on the runway, then respotted (skips without tiles)', () => {
    const tacloban = loadAirfield('tacloban')
    let before: AircraftState | null = null
    let touchdown: { x: number; z: number; sinkMps: number } | null = null
    let rest: { x: number; z: number } | null = null
    let respotTick: number | null = null
    let restAtS: number | null = null
    let worstOffSpotM = 0
    const world = fly(atIp('ai-1', { airfield: 'tacloban' }, terrain), 900, (w) => {
      const a = aircraftById(w, 'ai-1')!
      expect(a.impact, `impact at tick ${w.tick}`).toBeNull()
      const r = a.pilot!.decision.recovery!
      // The first tick on the wheels; the sink is the last airborne tick's.
      // (Not the phase: the pilot sees `rollout` a tick after the wheels do.)
      if (touchdown === null && before !== null && !airborne(a, w.terrain, [])) {
        touchdown = { x: a.state.position.x, z: a.state.position.z, sinkMps: -before.velocity.y }
      }
      if (rest === null && r.restAtS !== null) {
        rest = { x: a.state.position.x, z: a.state.position.z }
        restAtS = r.restAtS
      }
      before = a.state
      if (respotTick === null && r.respotted) respotTick = w.tick
      if (respotTick !== null) {
        const home = a.pilot!.home!
        if (home.kind !== 'runway') throw new Error('expected a runway home')
        worstOffSpotM = Math.max(worstOffSpotM, Math.hypot(a.state.position.x - home.parkWorld.x, a.state.position.z - home.parkWorld.z))
        return w.tick - respotTick >= WATCH_AFTER_RESPOT_S / DT
      }
    })
    expect(touchdown, 'never touched down').not.toBeNull()
    const td = touchdown!
    expect(insideRunway(tacloban, td.x, td.z)).toBe(true)
    expect(td.sinkMps).toBeLessThan(MAX_SUPPORTED_SINK_MPS)
    expect(rest, 'never came to rest').not.toBeNull()
    expect(insideRunway(tacloban, rest!.x, rest!.z)).toBe(true)
    expect(respotTick, 'never respotted').not.toBeNull()
    expect(respotTick! * DT - restAtS!).toBeGreaterThanOrEqual(RESPOT_DELAY_S)
    expect(worstOffSpotM).toBeLessThan(ON_SPOT_M)
    const a = aircraftById(world, 'ai-1')!
    expect(a.pilot!.decision.mode).toBe('landed')
    expect(a.impact).toBeNull()
    // On its wheels on the ground at the spot.
    expect(airborne(a, world.terrain, [])).toBe(false)
    expect(a.state.position.y - a.spec.gear.heightM - heightAt(terrain!, a.state.position.x, a.state.position.z)).toBeLessThan(0.25)
    // Measured 2026-09-28, the first flown runway recovery since Ruling P13's
    // `acrossDampingS`: touchdown at 154.2 s, 0.19 m left of the centerline,
    // sink 1.36 m/s, 492 m in from the approach end (117 m past the aim);
    // at rest 601 m past the aim, no bounce.
    const local = worldToLocal(tacloban, td.x, td.z)
    expect(Math.abs(local.x)).toBeLessThan(tacloban.runway.widthM / 4)
  })

  it('a landed AI is not a contact for a hostile (spec §2, end to end)', () => {
    const run = carrierRun()
    const ai = aircraftById(run.world, 'ai-1')!.state
    const hostile = aircraftById(run.world, 'axis-1')!.state
    // axis-1 3 km east of the respotted ai-1, 1,000 m up, flying north.
    const placed = (w: W, at: AircraftState): W => withAircraftState(w, 'axis-1', {
      ...hostile, position: v3(at.position.x + 3000, 1000, at.position.z), velocity: v3(0, 0, -110),
    })
    let targeted = false
    fly(placed(run.world, ai), 6, (w) => { targeted ||= aircraftById(w, 'axis-1')!.pilot!.decision.targetId !== null })
    expect(targeted).toBe(false)
    // The control case: the same geometry with ai-1 in the air at its IP.
    const flying = atIp('ai-1', { ship: 'cv-1' })
    let targetedFlying = false
    fly(placed(flying, aircraftById(flying, 'ai-1')!.state), 6, (w) => {
      targetedFlying ||= aircraftById(w, 'axis-1')!.pilot!.decision.targetId === 'ai-1'
    })
    expect(targetedFlying).toBe(true)
  })

  it('structuredClone round-trips a world with a respotted AI', () => {
    const w = carrierRun().world
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.recovery!.respotted).toBe(true)
    const clone = structuredClone(w)
    expect(clone).toEqual(w)
    expect(advance(clone, DT).world).toEqual(advance(w, DT).world)
  })
})

/**
 * Flies `w` until `reached`, then puts axis-1 `THREAT_RANGE_M` dead astern of
 * ai-1, 30 m above it (airborne, so a contact) and at 100 m/s along its track,
 * and flies on to `landed`. Counts the ticks before `landed` with the hostile
 * inside THREAT_ASTERN_RANGE_M, so a pass cannot be vacuous.
 */
const THREAT_RANGE_M = 300
function threatDuring(w0: W, reached: (w: W) => boolean) {
  const w1 = fly(w0, 900, reached)
  if (!reached(w1)) throw new Error('never reached the phase under test')
  const me = aircraftById(w1, 'ai-1')!.state
  const speed = Math.hypot(me.velocity.x, me.velocity.z)
  const track = v3(me.velocity.x / speed, 0, me.velocity.z / speed)
  const h = aircraftById(w1, 'axis-1')!.state
  const w2 = withAircraftState(w1, 'axis-1', {
    ...h, attitude: me.attitude, velocity: scale(track, 100),
    position: v3(me.position.x - track.x * THREAT_RANGE_M, me.position.y + 30, me.position.z - track.z * THREAT_RANGE_M),
  })
  const modes = new Set<string>()
  const phases = new Set<string>()
  let threatenedTicks = 0
  let gearUpOnGround = false
  const world = fly(w2, 120, (w) => {
    const a = aircraftById(w, 'ai-1')!
    modes.add(a.pilot!.decision.mode)
    phases.add(a.pilot!.decision.recovery?.phase ?? 'none')
    if (a.pilot!.decision.mode !== 'landed' && length(sub(aircraftById(w, 'axis-1')!.state.position, a.state.position)) <= THREAT_ASTERN_RANGE_M) threatenedTicks++
    gearUpOnGround ||= !airborne(a, w.terrain, decksOf(w.ships)) && a.controls.gearDown !== true
    return a.pilot!.decision.mode === 'landed'
  })
  return { modes: [...modes].sort(), phases: [...phases].sort(), threatenedTicks, gearUpOnGround, world }
}

describe('a threat astern once committed (7g spec §6, R3)', () => {
  const phase = (w: W) => aircraftById(w, 'ai-1')!.pilot!.decision.recovery?.phase
  const cut = (w: W) => aircraftById(w, 'ai-1')!.pilot!.decision.recovery?.cut === true

  it('in final after the cut, a hostile astern does not pre-empt: it stays in rtb and traps', () => {
    const run = threatDuring(atIp('ai-1', { ship: 'cv-1' }), (w) => phase(w) === 'final' && cut(w))
    expect(run.threatenedTicks * DT).toBeGreaterThan(2 * VETERAN_SKILL.reactionS)
    expect(run.modes).toEqual(['landed', 'rtb'])
    expect(run.phases).toEqual(['final', 'landed', 'rollout'])
    expect(run.gearUpOnGround).toBe(false)
    expect(aircraftById(run.world, 'ai-1')!.state.arrested || aircraftById(run.world, 'ai-1')!.pilot!.decision.recovery!.restAtS !== null).toBe(true)
  })

  it.skipIf(terrain === null)('in rollout, a hostile astern does not pre-empt: gear stays down to rest (skips without tiles)', () => {
    const run = threatDuring(atIp('ai-1', { airfield: 'tacloban' }, terrain), (w) => phase(w) === 'rollout')
    expect(run.threatenedTicks * DT).toBeGreaterThan(2 * VETERAN_SKILL.reactionS)
    expect(run.modes).toEqual(['landed', 'rtb'])
    expect(run.phases).toEqual(['landed', 'rollout'])
    expect(run.gearUpOnGround).toBe(false)
    expect(aircraftById(run.world, 'ai-1')!.impact).toBeNull()
  })
})

describe('the bolter: no touchdown, or airborne again unarrested (Ruling P17)', () => {
  const carrierWorld = (): W => buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1000, 20000])])
  const tick = (w: W) => {
    const a = aircraftById(w, 'ai-1')!
    const ctx = { nowS: nowS(w), terrain: w.terrain, ships: w.ships, combat: w.combat, decks: decksOf(w.ships), wind: w.wind }
    return recoveryControls(a, a.pilot!, ctx, w.aircraft).recovery
  }
  /** Meters from the carrier aim (the trap zone's center) to the bow. */
  const aimToBowM = (w: W): number => {
    const deck = decksOf(w.ships)[0]!
    return deck.lengthM - (deck.trapFromSternM + deck.trapToSternM) / 2
  }

  it('airborne in final past the bow, after the cut: go-around, cut cleared', () => {
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', { alongM: -(aimToBowM(w0) + 20), wheelM: 8, airspeedMps: 45, configured: true }), 'ai-1', 'final', true)
    const r = tick(w)
    expect(r.phase).toBe('go-around')
    expect(r.cut).toBe(false)
    expect(r.joinedAtS).toBeNull()
  })

  it('the control: airborne in final short of the aim, after the cut, stays in final', () => {
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', { alongM: 60, wheelM: 4, airspeedMps: 45, configured: true }), 'ai-1', 'final', true)
    expect(tick(w).phase).toBe('final')
  })

  it('airborne again in rollout (rolled off the bow unarrested): go-around', () => {
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', { alongM: -(aimToBowM(w0) + 5), wheelM: -2, airspeedMps: 35, configured: true }), 'ai-1', 'rollout', true)
    expect(airborne(aircraftById(w, 'ai-1')!, w.terrain, decksOf(w.ships))).toBe(true)
    const r = tick(w)
    expect(r.phase).toBe('go-around')
    expect(r.cut).toBe(false)
  })

  it('the control: rolling on the deck in rollout stays in rollout', () => {
    const w0 = carrierWorld()
    const w = inRecovery(onApproach(w0, 'ai-1', { alongM: -20, wheelM: 0, airspeedMps: 35, configured: true }), 'ai-1', 'rollout', true)
    expect(airborne(aircraftById(w, 'ai-1')!, w.terrain, decksOf(w.ships))).toBe(false)
    expect(tick(w).phase).toBe('rollout')
  })

  it('a landed pilot never leaves landed, and flies no noise, target or safety override', () => {
    const run = carrierRun()
    const w = fly(run.world, 3)
    const a = aircraftById(w, 'ai-1')!
    expect(a.pilot!.decision.mode).toBe('landed')
    expect(a.pilot!.decision.targetId).toBeNull()
    expect(a.controls).toEqual({ pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1, gearDown: true, flapDown: false, hookDown: false })
    expect(a.pilot!.decision.noiseCursor).toBe(aircraftById(run.world, 'ai-1')!.pilot!.decision.noiseCursor)
  })
})
