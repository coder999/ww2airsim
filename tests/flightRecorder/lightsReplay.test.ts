import { describe, expect, it } from 'vitest'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { launchHourMismatch, verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { parseFlightRecord, type FlightRecordV1 } from '../../src/flightRecorder/schema.js'
import { GREEN_SKILL, initialDecision } from '../../src/sim/ai/pilot.js'
import { DT } from '../../src/sim/flight/model.js'
import type { Controls } from '../../src/sim/flight/state.js'
import type { LightSpec } from '../../src/sim/lights/lights.js'
import { advance, createWorldOf, withControls, withNightFacts, withPlayerLights, type World } from '../../src/sim/loop.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { level } from '../sim/ai/maneuverWorlds.js'

/**
 * F6B Task 7: the lights switch is recorded input that the AI reads, so replay must apply it at the same fixed tick.
 * The scenario is the plan's: a Zero 3 miles ahead of the player at night; the player blacks out at tick 30 and the
 * Zero, which was closing on a lit target, loses it. Replay with the action dropped, or applied a tick late, must
 * diverge (the mutation checks); the honest one verifies bit-identically.
 */
const f6f = loadAircraftSpec('f6f-hellcat'), zero = loadAircraftSpec('a6m2-zero')
const SRC = { source: 'gameplay', sourceNote: 'test' } as const
const navOn = (id: string): LightSpec => ({ id: `nav-${id}`, kind: 'nav', at: { aircraft: id, point: 'all' }, color: 'white', state: 'on', ...SRC }) as LightSpec
const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }
const header = (): FlightRecordHeader => ({
  build: { id: 'test', dirty: false }, content: { scenarioId: 'lights-replay', sha256: 'b'.repeat(64) },
  launch: { aircraftSpec: f6f.id, loadout: 'clean', timeOfDay: 21, weather: {}, difficulty: 'veteran', assists: { stallLimiter: false, autoRudder: false }, arcadeDamage: false, dev: {} },
  environment: { browser: 'test', os: 'test', gpu: 'test', graphics: {} },
})
const BLACKOUT_TICK = 30, TICKS = 300

function initialWorld(): World<undefined> {
  const pilot = { target: null, skill: GREEN_SKILL, decision: { ...initialDecision('z'), targetId: null } }
  const z = level('z', zero, v3(0, 1500, 0), v3(100, 0, 0), pilot)
  const me = level('me', f6f, v3(4800, 1500, 0), v3(-100, 0, 0))
  return withNightFacts(createWorldOf({ aircraft: [me, z], player: 'me' }), { hour0: 21, latDeg: 11.24, cloudCover: 0.1, lights: [navOn('me'), navOn('z')] })
}
function fly(blackout: boolean): { record: FlightRecordV1; initial: World<undefined>; world: World<undefined> } {
  const initial = initialWorld()
  const recorder = createDevFlightRecorder(header(), initial)
  let world = initial
  for (let i = 0; i < TICKS; i++) {
    if (blackout && world.tick + 1 === BLACKOUT_TICK) {
      recorder.note({ tick: world.tick + 1, kind: 'control', control: 'lights', value: false })
      world = withPlayerLights(world, false)
    }
    world = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
  }
  return { record: recorder.finish(world), initial, world }
}
const withoutLights = (r: FlightRecordV1): FlightRecordV1 =>
  ({ ...r, packets: r.packets.map((p) => ({ ...p, actions: p.actions.filter((a) => !(a.kind === 'control' && a.control === 'lights')) })) })

describe('lights switch replay (F6B)', () => {
  const run = fly(true)
  it('the scenario is a real test: blacking out changes what the Zero does (else every check below is vacuous)', () => {
    const lit = fly(false)
    const targetOf = (w: World<undefined>) => w.aircraft.find((a) => a.id === 'z')!.pilot!.decision.targetId
    expect(targetOf(lit.world)).toBe('me')
    expect(targetOf(run.world)).toBeNull()
    expect(run.record.packets.some((p) => p.actions.length > 0)).toBe(true)
  })
  it('a record with a blackout verifies bit-identically at every checkpoint', () => {
    expect(verifyFlightRecord(run.record, run.initial)).toMatchObject({ ok: true, ticks: TICKS })
    expect(run.record.packets.filter((p) => p.checksum !== undefined).length).toBeGreaterThan(3)
  })
  it('MUTATION: a verifier that does not apply the action diverges (names a tick)', () => {
    const r = verifyFlightRecord(withoutLights(run.record), run.initial)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/divergence/)
  })
  it('MUTATION: applying the action a second late diverges (the tick it is applied at matters)', () => {
    const SHIFT = 60
    const late: FlightRecordV1 = { ...run.record, packets: run.record.packets.map((p, i, all) => ({
      ...p, actions: [...p.actions.filter((a) => a.kind !== 'control'), ...((all[i - SHIFT]?.actions ?? []).filter((a) => a.kind === 'control').map((a) => ({ ...a, tick: p.tick })))] as FlightRecordV1['packets'][number]['actions'],
    })) }
    expect(verifyFlightRecord(late, run.initial).ok).toBe(false)
  })
  it('a record written before F6B (no lights action, no night fact) still parses and verifies', () => {
    const initial = createWorldOf({ aircraft: [level('me', f6f, v3(0, 1500, 0), v3(100, 0, 0))], player: 'me' })
    const recorder = createDevFlightRecorder(header(), initial)
    let w = initial
    for (let i = 0; i < 5; i++) w = advance(withControls(w, w.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
    const record = recorder.finish(w)
    expect(() => parseFlightRecord(JSON.parse(JSON.stringify(record)))).not.toThrow()
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true })
  })
  it('reproducing at another hour is refused with a plain message, not "initial world mismatch"', () => {
    expect(launchHourMismatch(run.record, 21)).toBeNull()
    expect(launchHourMismatch(run.record, 18.5)).toMatch(/flown at 21\.00.*18\.50/)
  })
})

describe('sighted evidence (F6B, additive)', () => {
  it('records who saw the player, how far and the limit; a blacked-out run records fewer or later sightings than a lit one', () => {
    const lit = fly(false).record, dark = fly(true).record
    const sightings = (r: FlightRecordV1) => r.packets.flatMap((p) => p.events).filter((e) => e.kind === 'sighted')
    expect(sightings(lit).length).toBeGreaterThan(0)
    expect(sightings(lit)[0]!.detail).toMatch(/^sees me at \d+\.\d mi \(limit 3\.7 mi\)$/)
    expect(() => parseFlightRecord(JSON.parse(JSON.stringify(lit)))).not.toThrow()
    expect(sightings(dark).length).toBeLessThanOrEqual(sightings(lit).length)
  })
})
