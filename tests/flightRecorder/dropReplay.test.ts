import { describe, expect, it } from 'vitest'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { parseFlightRecord, type FlightRecordV1 } from '../../src/flightRecorder/schema.js'
import { DT } from '../../src/sim/flight/model.js'
import type { Controls } from '../../src/sim/flight/state.js'
import { advance, createWorldOf, playerAircraft, requestDrop, withControls, type World } from '../../src/sim/loop.js'
import { CARGO_DROP, isPilotJump } from '../../src/sim/bailout.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { level } from '../sim/ai/maneuverWorlds.js'

/**
 * F10D D.1: the player's drop is a recorded tick-boundary action (like the bailout and the lights switch), applied at the
 * same fixed tick on replay. The schema change is additive, so every earlier record parses and verifies unchanged (the last
 * test). Mutations: dropping the action, or applying it a tick late, must diverge.
 */
const ki57 = loadAircraftSpec('ki-57-ii-topsy'), f6f = loadAircraftSpec('f6f-hellcat')
const header2 = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 1000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' })
const flat = createTerrainField(header2, 0, new Int16Array(9).fill(100))
const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const header = (): FlightRecordHeader => ({
  build: { id: 'test', dirty: false }, content: { scenarioId: 'drop-replay', sha256: 'c'.repeat(64) },
  launch: { aircraftSpec: ki57.id, loadout: 'clean', timeOfDay: 12, weather: {}, difficulty: 'veteran', assists: { stallLimiter: false, autoRudder: false }, arcadeDamage: false, dev: {} },
  environment: { browser: 'test', os: 'test', gpu: 'test', graphics: {} },
})
/** A Ki-57 over a flat 10 m plain at 160 m, doors open (the state a pilot reaches with O held). */
function transport(doors = 1): World<undefined> {
  const me = level('me', ki57, v3(-400, 160, 0), v3(50, 0, 0))
  const open = { ...me, state: { ...me.state, bayDoorFraction: doors }, previous: { ...me.state, bayDoorFraction: doors } }
  return { ...createWorldOf({ aircraft: [open], player: 'me' }), terrain: flat }
}
const DROP_TICK = 30, TICKS = 400

function fly(drop: boolean): { record: FlightRecordV1; initial: World<undefined>; world: World<undefined> } {
  const initial = transport()
  const recorder = createDevFlightRecorder(header(), initial)
  let world = initial
  for (let i = 0; i < TICKS; i++) {
    if (drop && world.tick + 1 === DROP_TICK) {
      const r = requestDrop(world, world.player)
      if (!r.ok) throw new Error(`test setup: drop refused (${r.reason})`)
      recorder.note({ tick: world.tick + 1, kind: 'drop', aircraft: world.player })
      world = r.world
    }
    world = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
  }
  return { record: recorder.finish(world), initial, world }
}
const moveDrop = (r: FlightRecordV1, by: number): FlightRecordV1 => {
  const drops = r.packets.flatMap((p) => p.actions.filter((a) => a.kind === 'drop'))
  return { ...r, packets: r.packets.map((p) => ({
    ...p, actions: [...p.actions.filter((a) => a.kind !== 'drop'), ...drops.filter(() => p.tick === DROP_TICK + by).map((a) => ({ ...a, tick: p.tick }))] as FlightRecordV1['packets'][number]['actions'],
  })) }
}

describe('recorded drop (F10D D.1)', () => {
  const run = fly(true)
  it('the drop is a real stick: six men and two bundles, each carrying the envelope it left in, none a pilot jump', () => {
    const p = run.world.parachutists!
    expect(p.filter((e) => e.kind === 'trooper')).toHaveLength(CARGO_DROP.men)
    expect(p.filter((e) => e.kind === 'bundle')).toHaveLength(CARGO_DROP.bundles)
    expect(p.every((e) => !isPilotJump(e) && e.release !== undefined)).toBe(true)
    const r = p[0]!.release!
    expect(r.airspeedMps).toBeGreaterThan(45); expect(r.airspeedMps).toBeLessThan(56) // 50 m/s set; the untrimmed airframe has moved a half second
    expect(r.altitudeM).toBeGreaterThan(150); expect(r.altitudeM).toBeLessThan(165)
    expect(r.headingDeg).toBeCloseTo(90, 0)
    expect(run.record.packets.flatMap((q) => q.actions).filter((a) => a.kind === 'drop')).toEqual([{ tick: DROP_TICK, kind: 'drop', aircraft: 'me' }])
  })
  it('a record with a drop verifies bit-identically at every checkpoint', () => {
    expect(verifyFlightRecord(run.record, run.initial)).toMatchObject({ ok: true, ticks: TICKS })
    expect(run.record.packets.filter((q) => q.checksum !== undefined).length).toBeGreaterThan(3)
  })
  it('survives a JSON round trip and parses', () => {
    const again = parseFlightRecord(JSON.parse(JSON.stringify(run.record)))
    expect(verifyFlightRecord(again, run.initial).ok).toBe(true)
  })
  it('MUTATION: a verifier that never applies the drop diverges, naming a tick', () => {
    const r = verifyFlightRecord(moveDrop(run.record, 9999), run.initial)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/divergence/)
  })
  it('MUTATION: a drop applied a tick late (the wrong tick) fails', () => {
    expect(verifyFlightRecord(moveDrop(run.record, 1), run.initial).ok).toBe(false)
    expect(verifyFlightRecord(moveDrop(run.record, -1), run.initial).ok).toBe(false)
  })
  it('a recorded drop the live sim would have refused is a named failure, not a silent skip', () => {
    const shut = { ...run.initial, aircraft: [{ ...playerAircraft(run.initial), state: { ...playerAircraft(run.initial).state, bayDoorFraction: 0 } }] }
    const r = verifyFlightRecord(run.record, shut, { allowMismatch: true })
    expect(r.ok).toBe(false)
  })
  it('refusals: doors shut, a second drop, a fighter with no cargo doors', () => {
    expect(requestDrop(transport(0), 'me')).toMatchObject({ ok: false, reason: 'doors-shut' })
    const first = requestDrop(transport(), 'me')
    expect(first.ok).toBe(true)
    if (first.ok) expect(requestDrop(first.world, 'me')).toMatchObject({ ok: false, reason: 'already-dropped' })
    const fighter = level('me', f6f, v3(-400, 160, 0), v3(50, 0, 0))
    expect(requestDrop({ ...createWorldOf({ aircraft: [fighter], player: 'me' }), terrain: flat }, 'me')).toMatchObject({ ok: false, reason: 'no-cargo' })
  })
  it('a record written before the drop action (a plain flight) still parses and verifies', () => {
    const none = fly(false)
    expect(none.world.parachutists).toBeUndefined()
    expect(() => parseFlightRecord(JSON.parse(JSON.stringify(none.record)))).not.toThrow()
    expect(verifyFlightRecord(none.record, none.initial)).toMatchObject({ ok: true, ticks: TICKS })
  })
})
