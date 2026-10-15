import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { canonicalStringify, sha256 } from '../../src/flightRecorder/canonical.js'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'
import { decodeFlightRecord, encodeFlightRecord } from '../../src/flightRecorder/codec.js'
import { createDevFlightRecorder, type FlightRecordHeader } from '../../src/flightRecorder/recorder.js'
import { parseFlightRecord } from '../../src/flightRecorder/schema.js'
import { verifyFlightRecord } from '../../src/flightRecorder/verify.js'
import { orderWingmen } from '../../src/sim/ai/wingmanOrders.js'
import { createState, type Controls } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { advance, createWorld, withControls, type World } from '../../src/sim/loop.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { BINDINGS } from '../../src/input/bindings.js'
import { initialFrameStateFor, nextFrameState } from '../../src/render/frame.js'
import { buildFormation, PLAYER_EAST, wingman } from '../sim/ai/formationWorlds.js'
import { missionWorld, REACH_FAR } from '../sim/mission/fixture.js'
import { bundleForScenario } from '../../tools/content/load.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const controls: Controls = { pitch: 0.05, roll: -0.1, yaw: 0.02, throttle: 0.72, fire: true }
const start = (): World<undefined> => createWorld(
  f6f,
  createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) }),
  controls,
)

const header = (): FlightRecordHeader => ({
  build: { id: 'test-build', dirty: false },
  content: { scenarioId: 'recorder-test', sha256: 'a'.repeat(64) },
  launch: {
    aircraftSpec: f6f.id,
    loadout: 'clean',
    timeOfDay: 12,
    weather: { cloud: 'clear' },
    difficulty: 'veteran',
    assists: { stallLimiter: false, autoRudder: false },
    arcadeDamage: false,
    dev: {},
  },
  environment: { browser: 'test', os: 'test', gpu: 'test', graphics: {} },
})

const recordedFlight = (ticks = 120) => {
  const initial = start()
  const recorder = createDevFlightRecorder(header(), initial)
  let world = initial
  for (let i = 0; i < ticks; i++) {
    const result = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe)
    world = result.world
  }
  return { initial, world, record: recorder.finish(world, { headline: 'TEST COMPLETE' }) }
}

describe('Dev Flight Recorder', () => {
  it('canonicalizes object keys, sets and negative zero before hashing', async () => {
    const a = { z: -0, a: new Set(['b', 'a']), nested: { y: 2, x: 1 } }
    const b = { nested: { x: 1, y: 2 }, a: new Set(['a', 'b']), z: 0 }
    expect(canonicalStringify(a)).toBe(canonicalStringify(b))
    expect(await sha256(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256(a)).toBe(await sha256(b))
  })

  it('keeps entity order and structure damage in world checksums while ignoring frame accumulator history', () => {
    const world = missionWorld({ objectives: [REACH_FAR] })
    expect(world.ships.length).toBeGreaterThan(1)
    expect(worldChecksum({ ...world, accumulatorSeconds: DT / 2 })).toBe(worldChecksum(world))
    expect(worldChecksum({ ...world, ships: [...world.ships].reverse() })).not.toBe(worldChecksum(world))
    const structureId = Object.keys(world.combat.structures)[0]!
    const structure = world.combat.structures[structureId]!
    const damaged = {
      ...world,
      combat: {
        ...world.combat,
        structures: { ...world.combat.structures, [structureId]: { ...structure, hp: structure.hp - 1 } },
      },
    }
    expect(worldChecksum(damaged)).not.toBe(worldChecksum(world))
  })

  it('observes every fixed tick in a multi-step advance with the exact consumed controls', () => {
    const world = start()
    const seen: { tick: number; controls: Controls; checksum: string }[] = []
    const result = advance(world, DT * 3, undefined, undefined, false, undefined, (observation) => {
      seen.push({ tick: observation.tick, controls: observation.controls, checksum: worldChecksum(observation.world) })
    })
    expect(result.stepsRun).toBe(3)
    expect(seen.map((entry) => entry.tick)).toEqual([1, 2, 3])
    expect(seen.map((entry) => entry.controls)).toEqual([controls, controls, controls])
    expect(new Set(seen.map((entry) => entry.checksum)).size).toBe(3)
  })

  it('records a one-shot release once through a multi-step frame while held guns remain continuous', () => {
    const pulses: Controls[] = []
    const result = advance(
      withControls(start(), 'player', { ...controls, dropBomb: true, fireRockets: true }),
      DT * 3,
      undefined,
      undefined,
      false,
      undefined,
      ({ controls: applied }) => pulses.push(applied),
    )
    expect(result.stepsRun).toBe(3)
    expect(pulses.map((entry) => entry.fire)).toEqual([true, true, true])
    expect(pulses.map((entry) => entry.dropBomb)).toEqual([true, undefined, undefined])
    expect(pulses.map((entry) => entry.fireRockets)).toEqual([true, undefined, undefined])
  })

  it('records successful rack and rocket releases as diagnostic evidence', () => {
    const initial = worldFromScenario(bundleForScenario(parseScenario({
      id: 'release-test', player: 'f6f-1', airfields: ['tacloban'], ships: [],
      aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }],
      weather: { windFromDeg: 0, windMps: 0 },
    })), null, 'both')
    const recorder = createDevFlightRecorder(header(), initial)
    const armed = withControls(initial, initial.player, { ...controls, dropBomb: true, fireRockets: true })
    const world = advance(armed, DT, undefined, undefined, false, undefined, recorder.observe).world
    const record = recorder.finish(world)
    expect(record.packets[0]?.events).toEqual(expect.arrayContaining([
      { tick: 1, kind: 'release', entity: 'f6f-1', detail: 'torpedo x1' },
      { tick: 1, kind: 'release', entity: 'f6f-1', detail: 'rocket x2' },
    ]))
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: 1 })
  })

  it('records no ticks while paused and all three fixed ticks at triple time', () => {
    const initial = start()
    const recorder = createDevFlightRecorder(header(), initial)
    let frame = initialFrameStateFor(initial)
    frame = nextFrameState(frame, DT, new Set(BINDINGS.pause), undefined, false, undefined, undefined, recorder.observe)
    expect(frame.paused).toBe(true)
    expect(recorder.snapshot().packets).toHaveLength(0)
    frame = nextFrameState(frame, DT, new Set(), undefined, false, undefined, undefined, recorder.observe)
    frame = nextFrameState(frame, DT, new Set(BINDINGS.pause), undefined, false, undefined, undefined, recorder.observe)
    expect(frame.paused).toBe(false)
    expect(recorder.snapshot().packets).toHaveLength(1)

    const fastInitial = start()
    const fastRecorder = createDevFlightRecorder(header(), fastInitial)
    const fast = nextFrameState(
      initialFrameStateFor(fastInitial),
      DT,
      new Set(BINDINGS.toggleTripleTime),
      undefined,
      false,
      undefined,
      undefined,
      fastRecorder.observe,
    )
    expect(fast.timeScale).toBe(3)
    expect(fast.stepsRun).toBe(3)
    expect(fastRecorder.finish(fast.world).packets.map((packet) => packet.tick)).toEqual([1, 2, 3])
  })

  it('exports a pause boundary without a new tick and becomes unexported after flight continues', () => {
    const initial = start()
    const recorder = createDevFlightRecorder(header(), initial)
    let world = advance(initial, DT, undefined, undefined, false, undefined, recorder.observe).world
    recorder.note({ tick: world.tick, kind: 'pause', paused: true })
    const paused = recorder.snapshot()
    expect(paused.valid).toBe(true)
    expect(paused.packets[0]?.actions).toEqual([{ tick: 1, kind: 'pause', paused: true }])
    recorder.markExported()
    expect(recorder.exported()).toBe(true)
    world = advance(world, DT, undefined, undefined, false, undefined, recorder.observe).world
    expect(recorder.exported()).toBe(false)
    expect(recorder.snapshot().packets[1]?.actions).toEqual([{ tick: 2, kind: 'pause', paused: true }])
  })

  it('round-trips a compressed record and re-simulates bit-identically', async () => {
    const { initial, world, record } = recordedFlight()
    expect(record.packets).toHaveLength(120)
    expect(record.packets.filter((packet) => packet.checksum !== undefined).map((packet) => packet.tick)).toEqual([60, 120])
    expect(record.final?.checksum).toBe(worldChecksum(world))

    const bytes = await encodeFlightRecord(record)
    const decoded = await decodeFlightRecord(bytes)
    expect(bytes.byteLength).toBeLessThan(canonicalStringify(record).length)
    expect(decoded).toEqual(record)

    const result = verifyFlightRecord(decoded, initial, { buildId: 'test-build', contentSha256: 'a'.repeat(64) })
    expect(result.ok).toBe(true)
    if (result.ok) expect(worldChecksum(result.world)).toBe(worldChecksum(world))
  })

  it('reports the first checkpoint after a deliberate control perturbation', () => {
    const { initial, record } = recordedFlight()
    const changed = structuredClone(record)
    changed.packets[0] = { ...changed.packets[0]!, controls: { ...changed.packets[0]!.controls, pitch: 0.8 } }
    const result = verifyFlightRecord(parseFlightRecord(changed), initial)
    expect(result).toMatchObject({ ok: false, tick: 60, message: 'first divergence at tick 60' })
  })

  it('re-simulates to an inspection tick without retaining a full-flight snapshot stream', () => {
    const { initial, record } = recordedFlight()
    const observed: number[] = []
    const result = verifyFlightRecord(record, initial, { endTick: 90, onWorld: (world) => observed.push(world.tick) })
    expect(result).toMatchObject({ ok: true, ticks: 90 })
    expect(observed).toHaveLength(90)
    expect(observed.at(-1)).toBe(90)
  })

  it('preserves the exact attack target selected for a wingman order', () => {
    const wing = wingman('ally-1', 'f6f-1', 1, [-80, 3000, 100])
    const bandit = { id: 'ahead', spec: 'a6m2-zero', side: 'axis' as const, airborneAt: { position: [5000, 3000, 0] as const, headingDeg: 90, speedMps: 110 } }
    const initial = buildFormation([PLAYER_EAST, wing, bandit])
    const recorder = createDevFlightRecorder(header(), initial)
    recorder.note({ tick: initial.tick, kind: 'wingman-order', command: 'attack' })
    const ordered = orderWingmen(initial, { kind: 'attack', target: 'ahead' })
    const world = advance(ordered, DT, undefined, undefined, false, undefined, recorder.observe).world
    const record = recorder.finish(world)
    expect(record.packets[0]?.actions).toEqual([{ tick: 1, kind: 'wingman-order', command: 'attack', target: 'ahead' }])
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: 1 })
  })

  it('records the player\'s lights switch (F6A D2), round-trips it through the codec, and a lights flip changes nothing in the replay', async () => {
    const initial = start()
    const recorder = createDevFlightRecorder(header(), initial)
    recorder.note({ tick: initial.tick + 1, kind: 'control', control: 'lights', value: false })
    let world = advance(withControls(initial, initial.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
    recorder.note({ tick: world.tick + 1, kind: 'control', control: 'lights', value: true })
    world = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
    const record = recorder.finish(world)
    expect(record.packets.map((p) => p.actions)).toEqual([
      [{ tick: 1, kind: 'control', control: 'lights', value: false }],
      [{ tick: 2, kind: 'control', control: 'lights', value: true }],
    ])
    expect(await decodeFlightRecord(await encodeFlightRecord(record))).toEqual(record)
    // No sim effect until F6B: the world after the same two ticks WITHOUT the actions is bit-identical, and the record verifies.
    let plain = initial
    for (let i = 0; i < 2; i++) plain = advance(withControls(plain, plain.player, controls), DT).world
    expect(worldChecksum(world)).toBe(worldChecksum(plain))
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: 2 })
  })

  it('still parses a record written before the lights action existed (the enum is only extended)', () => {
    const { record } = recordedFlight(5)
    const clone = JSON.parse(JSON.stringify(record)) as { packets: { actions: { control?: string }[] }[] }
    expect(JSON.stringify(clone)).not.toContain('lights')
    expect(() => parseFlightRecord(clone)).not.toThrow()
  })

  it('captures held-group mission spawns and verifies through the trigger', () => {
    const raid = {
      id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'],
      airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 },
      pilot: { target: 'f6f-1' },
    }
    const initial = missionWorld({
      objectives: [REACH_FAR],
      triggers: [{ id: 'launch', when: { at: 0.5 }, then: [{ message: 'Bandits inbound' }, { spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [raid] }],
    })
    const recorder = createDevFlightRecorder(header(), initial)
    let world = initial
    for (let i = 0; i < 31; i++) {
      world = advance(world, DT, undefined, undefined, false, undefined, recorder.observe).world
    }
    const record = recorder.finish(world)
    const spawnPacket = record.packets.find((packet) => packet.tick === 30)
    expect(spawnPacket?.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ tick: 30, kind: 'mission', detail: expect.stringContaining('"group":"wave-1"') }),
      { tick: 30, kind: 'spawn', entity: 'raid-2', detail: 'spawned' },
    ]))
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: 31 })
  })

  it('fails closed on build, content, initial-world and packet corruption', () => {
    const { initial, record } = recordedFlight(2)
    expect(verifyFlightRecord(record, initial, { buildId: 'other' })).toMatchObject({ ok: false, message: expect.stringContaining('build mismatch') })
    expect(verifyFlightRecord(record, initial, { contentSha256: 'b'.repeat(64) })).toMatchObject({ ok: false, message: expect.stringContaining('content mismatch') })
    const moved = { ...initial, tick: 1 }
    expect(verifyFlightRecord(record, moved)).toMatchObject({ ok: false, message: 'initial world mismatch' })

    const gap = structuredClone(record) as unknown as { packets: { tick: number }[] }
    gap.packets[1]!.tick = 3
    expect(() => parseFlightRecord(gap)).toThrow('packet tick 3; expected 2')
    expect(() => parseFlightRecord({ ...record, version: 99 })).toThrow('version')
  })

  it('verifies bit-identically after frame hitches that dropped fixed steps while keys changed', () => {
    let frame = initialFrameStateFor(start(), header().launch.assists)
    const initial = frame.world
    const recorder = createDevFlightRecorder(header(), initial)
    let dropped = 0
    const keys = [BINDINGS.pitchUp, BINDINGS.rollLeft, BINDINGS.yawRight, BINDINGS.throttleUp]
    for (let i = 0; i < 300; i++) {
      // Hitch every seventh frame: far longer than the loop's catch-up cap, so steps are dropped.
      const elapsed = i % 7 === 3 ? 0.6 : 1 / 60
      const pressed = new Set(keys.filter((_, k) => (i >> (k % 3 + 1)) % 2 === k % 2).flatMap((k) => [...k]))
      frame = nextFrameState(frame, elapsed, pressed, undefined, false, undefined, undefined, recorder.observe)
      dropped += frame.droppedSteps
    }
    const record = recorder.finish(frame.world)
    expect(record.valid).toBe(true)
    // Dropped steps never advance a tick, so the per-tick consumed controls still reproduce the run
    // (measured 2026-10-14: 1,333 dropped steps, bit-identical). A slow, GPU-less machine stays valid.
    expect(dropped).toBeGreaterThan(0)
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: record.packets.length })
  })

  it('checksums the last simulated tick, not controls a later no-step frame applied', () => {
    const initial = start()
    const recorder = createDevFlightRecorder(header(), initial)
    let world = initial
    for (let i = 0; i < 90; i++) {
      world = advance(withControls(world, world.player, controls), DT, undefined, undefined, false, undefined, recorder.observe).world
    }
    // A held or paused frame: new controls land on the world, but no fixed step runs.
    const later = withControls(world, world.player, { ...controls, pitch: -0.4, throttle: 0 })
    const record = recorder.finish(later)
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: true, ticks: 90 })
  })

  it('marks a dropped-step recording invalid and refuses to verify it', () => {
    const initial = start()
    const recorder = createDevFlightRecorder(header(), initial)
    recorder.invalidate('dropped 4 fixed steps after a frame hitch')
    const record = recorder.finish(initial)
    expect(record.valid).toBe(false)
    expect(verifyFlightRecord(record, initial)).toMatchObject({ ok: false, message: expect.stringContaining('dropped 4 fixed steps') })
  })
})
