/**
 * F5C D9 (2026-10-16): one continuous `.ww2flight` per sortie. The ground stop is a recorded action carrying the loadout
 * id; replay reproduces leg 1 (an approach and landing), the stop and leg 2 (a takeoff roll and climb) bit for bit.
 */
import { describe, expect, it } from 'vitest'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'
import { decodeFlightRecord, encodeFlightRecord } from '../../src/flightRecorder/codec.js'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { parseFlightRecord } from '../../src/flightRecorder/schema.js'
import { verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { groundStop } from '../../src/sim/groundStop.js'
import { DT } from '../../src/sim/flight/model.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../src/sim/loop.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { lastLanding } from '../../src/sim/mission/state.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { runwayHeadingRad } from '../../src/sim/world/airfields.js'
import { approachControls, VREF_STALL_MULTIPLE } from '../../tools/autopilot/approach.js'
import { bundleForScenario, loadAirfield } from '../../tools/content/load.js'
import { flatField } from '../sim/mission/fixture.js'

const TAC = loadAirfield('tacloban')

const header = (): FlightRecordHeader => ({
  build: { id: 'test-build', dirty: false },
  content: { scenarioId: 'leg-record', sha256: 'b'.repeat(64) },
  launch: {
    aircraftSpec: 'f6f-hellcat', loadout: 'both', timeOfDay: 12, weather: {}, difficulty: 'veteran',
    assists: { stallLimiter: false, autoRudder: false }, arcadeDamage: false, dev: {},
  },
  environment: { browser: 'test', os: 'test', gpu: 'test', graphics: {} },
})

/** A mission world on final approach to Tacloban (calm, flat 100 m ground), as `fieldApproach` sets it up. */
function approachWorld(): World<undefined> {
  const raw = {
    id: 'leg-record', player: 'f6f-1', airfields: ['tacloban'], ships: [], weather: { windFromDeg: 0, windMps: 0 },
    aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 0, speedMps: 80 } }],
    objectives: [{ id: 'home', label: 'Land at any friendly base', priority: 'primary', kind: 'land', at: 'tacloban', suggestedRecovery: true }],
  }
  let w = worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(100), 'both')
  const spec = playerAircraft(w).spec
  const h = runwayHeadingRad(TAC)
  const along = v3(Math.sin(h), 0, -Math.cos(h))
  const c = TAC.runway.center
  const aim = { x: c.x - along.x * (TAC.runway.lengthM / 4), z: c.z - along.z * (TAC.runway.lengthM / 4) }
  const vref = VREF_STALL_MULTIPLE * spec.reference.stallSpeedFlapMps
  w = withAircraftState(w, w.player, createState({
    position: v3(aim.x - along.x * 5000, 100 + spec.gear.heightM + 5000 * Math.tan((3 * Math.PI) / 180), aim.z - along.z * 5000),
    velocity: v3(along.x * vref, 0, along.z * vref), attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - h),
    gearFraction: 1, flapFraction: 1, tick: w.tick,
  }))
  return { ...w, aircraft: w.aircraft.map((a) => (a.id === w.player ? { ...a, parked: false } : a)) }
}

function recordTwoLegs() {
  const initial = approachWorld()
  const recorder = createDevFlightRecorder(header(), initial)
  const spec = playerAircraft(initial).spec
  const h = runwayHeadingRad(TAC)
  const along = v3(Math.sin(h), 0, -Math.cos(h))
  const c = TAC.runway.center
  const target = {
    aimX: c.x - along.x * (TAC.runway.lengthM / 4), aimZ: c.z - along.z * (TAC.runway.lengthM / 4),
    runwayHeadingRad: h, touchdownElevationM: 100, windVelocity: v3(0, 0, 0),
  }
  let world = initial
  const step = (controls: Controls): void => {
    world = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
  }
  // Leg 1: fly the approach down to a stop on the strip.
  for (let i = 0; i < 300 / DT && lastLanding(world.mission!) === undefined; i++) step(approachControls(spec, playerAircraft(world).state, target))
  expect(lastLanding(world.mission!)?.base).toMatchObject({ kind: 'airfield', id: 'tacloban' })
  const legOneEnd = world.tick
  // The ground stop: recorded at the next fixed tick, applied before it (main.ts and verify.ts do the same).
  const stopped = groundStop(world, 'bombs')
  expect(stopped.ok).toBe(true)
  if (!stopped.ok) throw new Error('no stop')
  recorder.note({ tick: world.tick + 1, kind: 'ground-stop', loadout: 'bombs' })
  world = stopped.world
  // Leg 2: a takeoff roll and climb.
  for (let i = 0; i < 25 / DT; i++) step({ pitch: i * DT > 12 ? 0.25 : 0, roll: 0, yaw: 0, throttle: 1, gearDown: true, flapDown: false, brake: 0 })
  return { initial, world, legOneEnd, record: recorder.finish(world, { headline: 'TWO LEGS' }) }
}

describe('one flight record across a ground stop (D9)', () => {
  const run = recordTwoLegs()

  it('is one record: the stop is a recorded action at the tick after the first landing, carrying the loadout id', () => {
    const stops = run.record.packets.flatMap((p) => p.actions.map((a) => ({ tick: p.tick, a }))).filter((x) => x.a.kind === 'ground-stop')
    expect(stops).toEqual([{ tick: run.legOneEnd + 1, a: { tick: run.legOneEnd + 1, kind: 'ground-stop', loadout: 'bombs' } }])
    expect(run.record.packets.at(-1)!.tick).toBeGreaterThan(run.legOneEnd + 1000)
    expect(run.record.valid).toBe(true)
    expect(run.record.packets.some((p) => p.events.some((e) => e.kind === 'landing'))).toBe(true)
    // Leg 2 really flew: it left the ground.
    expect(playerAircraft(run.world).state.position.y).toBeGreaterThan(100 + 5)
  })

  it('replays leg 1, the stop and leg 2 exactly, through a compress and decode', async () => {
    const decoded = await decodeFlightRecord(await encodeFlightRecord(run.record))
    const result = verifyFlightRecord(decoded, approachWorld(), { buildId: 'test-build', contentSha256: 'b'.repeat(64) })
    expect(result.ok).toBe(true)
    if (result.ok) expect(worldChecksum(result.world)).toBe(worldChecksum(run.world))
  })

  it('fails closed when the stop is changed or removed: the replay diverges at a checkpoint', () => {
    const tampered = (edit: (actions: ReturnType<typeof parseFlightRecord>['packets'][number]['actions']) => ReturnType<typeof parseFlightRecord>['packets'][number]['actions']) => {
      const copy = structuredClone(run.record)
      copy.packets = copy.packets.map((p) => (p.actions.some((a) => a.kind === 'ground-stop') ? { ...p, actions: edit(p.actions) } : p))
      return parseFlightRecord(copy)
    }
    const clean = tampered((a) => a.map((x) => (x.kind === 'ground-stop' ? { ...x, loadout: 'clean' } : x)))
    expect(verifyFlightRecord(clean, approachWorld()).ok).toBe(false)
    const without = tampered((a) => a.filter((x) => x.kind !== 'ground-stop'))
    expect(verifyFlightRecord(without, approachWorld()).ok).toBe(false)
  })

  it('a recorded stop the replay world cannot honour is reported, not skipped', () => {
    const copy = structuredClone(run.record)
    copy.packets = copy.packets.map((p) => ({ ...p, actions: p.actions.map((a) => (a.kind === 'ground-stop' ? { ...a, loadout: 'torpedoes' } : a)) }))
    const result = verifyFlightRecord(parseFlightRecord(copy), approachWorld())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/recorded ground stop rejected/)
  })
})
